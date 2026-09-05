import { parseDurationMs } from './types';
import { STACK_ORDER, seriesForType, statusRole, type SeriesKey } from './chart-theme';
import type { ExceptionData, TelemetryItem } from './types';

/**
 * Aggregates over whatever is currently in view. Everything here is a single
 * pass over the items plus a sort of the (far smaller) group list, so it stays
 * cheap enough to recompute as telemetry streams in.
 */

export interface DurationStats {
  count: number;
  failed: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface GroupRow extends DurationStats {
  key: string;
  /** Secondary label — a dependency's type, a trace's top severity. */
  detail?: string;
  /** Per-bucket counts, aligned to `Insights.buckets`, for the row's sparkline. */
  trend: number[];
}

/** One slice of time. All bucket arrays in `Insights` share this axis. */
export interface TimeBucket {
  /** Start of the bucket, epoch ms. */
  from: number;
  /** Counts by chart series, in `STACK_ORDER`. */
  counts: number[];
  total: number;
}

export interface OutcomeBucket {
  from: number;
  /** Requests by status role: good, warning, critical, serious. */
  good: number;
  warning: number;
  critical: number;
  serious: number;
  total: number;
}

/** One bar of the request-latency histogram. */
export interface LatencyBin {
  /** Inclusive lower edge, ms. */
  from: number;
  /** Exclusive upper edge, ms. */
  to: number;
  count: number;
}

export interface ExceptionRow {
  key: string;
  typeName: string;
  count: number;
  lastSeen: string;
  sampleMessage: string;
}

export interface TraceRow {
  category: string;
  total: number;
  /** Counts by severity level, 0 (Verbose) to 4 (Critical). */
  bySeverity: [number, number, number, number, number];
}

export interface Insights {
  totals: {
    items: number;
    requests: number;
    failedRequests: number;
    dependencies: number;
    failedDependencies: number;
    exceptions: number;
    traces: number;
    tracesAtWarningOrAbove: number;
  };
  requestDuration: DurationStats;
  dependencyDuration: DurationStats;
  /** Oldest and newest timestamps in view, for the span the numbers cover. */
  span: { from: string; to: string } | null;
  /** Shared time axis for every trend in this result. */
  buckets: TimeBucket[];
  bucketMs: number;
  outcomes: OutcomeBucket[];
  /** Request durations. */
  latency: LatencyBin[];
  /** Dependency durations, on the same edges so the two read comparably. */
  dependencyLatency: LatencyBin[];
  requestsByOperation: GroupRow[];
  dependenciesByTarget: GroupRow[];
  exceptionsByProblem: ExceptionRow[];
  tracesByCategory: TraceRow[];
  responseCodes: { code: string; count: number; failed: boolean }[];
}

const MAX_ROWS = 50;

/** Roughly how many columns the volume chart should draw. */
const TARGET_BUCKETS = 48;

/**
 * Bucket widths worth landing on, so the time axis reads in round numbers
 * rather than "every 1.37 seconds".
 */
const NICE_INTERVALS_MS = [
  100, 250, 500,
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 21_600_000, 43_200_000, 86_400_000,
];

function chooseBucketMs(spanMs: number): number {
  for (const interval of NICE_INTERVALS_MS) {
    if (spanMs / interval <= TARGET_BUCKETS) return interval;
  }
  return NICE_INTERVALS_MS[NICE_INTERVALS_MS.length - 1];
}

/** Log-ish edges: latency is never uniformly distributed. */
const LATENCY_EDGES = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, Infinity];

interface Accumulator {
  count: number;
  failed: number;
  total: number;
  max: number;
  durations: number[];
  trend: number[];
  detail?: string;
}

function newAccumulator(bucketCount: number): Accumulator {
  return { count: 0, failed: 0, total: 0, max: 0, durations: [], trend: new Array(bucketCount).fill(0) };
}

function record(acc: Accumulator, ms: number | undefined, failed: boolean, bucket: number): void {
  acc.count++;
  if (failed) acc.failed++;
  if (bucket >= 0 && bucket < acc.trend.length) acc.trend[bucket]++;
  if (ms === undefined) return;
  acc.total += ms;
  acc.durations.push(ms);
  if (ms > acc.max) acc.max = ms;
}

/** Nearest-rank p95. Exact rather than interpolated — these are small samples. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

function summarise(acc: Accumulator): DurationStats {
  const sorted = acc.durations.slice().sort((a, b) => a - b);
  return {
    count: acc.count,
    failed: acc.failed,
    avgMs: sorted.length ? acc.total / sorted.length : 0,
    p95Ms: percentile(sorted, 0.95),
    maxMs: acc.max,
  };
}

function toRows(groups: Map<string, Accumulator>): GroupRow[] {
  const rows: GroupRow[] = [];
  for (const [key, acc] of groups) {
    rows.push({ key, detail: acc.detail, trend: acc.trend, ...summarise(acc) });
  }
  // Slowest first — the reason to open this page is usually "what is slow".
  rows.sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);
  return rows.slice(0, MAX_ROWS);
}

function baseDataOf(item: TelemetryItem): Record<string, unknown> | undefined {
  return item.envelope.data?.baseData as unknown as Record<string, unknown> | undefined;
}

export function computeInsights(items: TelemetryItem[]): Insights {
  // First pass finds the time span, because the bucket width depends on it.
  let minTime = Infinity;
  let maxTime = -Infinity;
  let from = '';
  let to = '';
  for (const item of items) {
    const t = Date.parse(item.timestamp);
    if (!Number.isFinite(t)) continue;
    if (t < minTime) { minTime = t; from = item.timestamp; }
    if (t > maxTime) { maxTime = t; to = item.timestamp; }
  }

  const hasTime = Number.isFinite(minTime);
  const bucketMs = hasTime ? chooseBucketMs(maxTime - minTime) : NICE_INTERVALS_MS[0];
  const bucketCount = hasTime ? Math.floor((maxTime - minTime) / bucketMs) + 1 : 0;
  const bucketOf = (timestamp: string): number => {
    if (!hasTime) return -1;
    const t = Date.parse(timestamp);
    if (!Number.isFinite(t)) return -1;
    return Math.min(bucketCount - 1, Math.max(0, Math.floor((t - minTime) / bucketMs)));
  };

  const seriesIndex = new Map<SeriesKey, number>(STACK_ORDER.map((k, i) => [k, i]));
  const buckets: TimeBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    from: minTime + i * bucketMs,
    counts: new Array(STACK_ORDER.length).fill(0),
    total: 0,
  }));
  const outcomes: OutcomeBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    from: minTime + i * bucketMs,
    good: 0, warning: 0, critical: 0, serious: 0, total: 0,
  }));
  const makeBins = (): LatencyBin[] =>
    LATENCY_EDGES.slice(0, -1).map((edge, i) => ({ from: edge, to: LATENCY_EDGES[i + 1], count: 0 }));
  const latency = makeBins();
  const dependencyLatency = makeBins();

  const bin = (bins: LatencyBin[], ms: number): void => {
    for (let i = 0; i < bins.length; i++) {
      if (ms >= bins[i].from && ms < bins[i].to) {
        bins[i].count++;
        return;
      }
    }
  };

  const requests = new Map<string, Accumulator>();
  const dependencies = new Map<string, Accumulator>();
  const exceptions = new Map<string, { row: ExceptionRow }>();
  const traces = new Map<string, TraceRow>();
  const codes = new Map<string, { count: number; failed: boolean }>();

  const allRequests = newAccumulator(bucketCount);
  const allDependencies = newAccumulator(bucketCount);
  let exceptionCount = 0;
  let traceCount = 0;
  let tracesAtWarning = 0;

  for (const item of items) {
    const bucket = bucketOf(item.timestamp);
    if (bucket >= 0) {
      const slot = seriesIndex.get(seriesForType(item.type)) ?? STACK_ORDER.length - 1;
      buckets[bucket].counts[slot]++;
      buckets[bucket].total++;
    }

    const bd = baseDataOf(item);

    switch (item.type) {
      case 'Request': {
        const ms = parseDurationMs(bd?.duration as string | undefined);
        const failed = bd?.success === false;
        record(allRequests, ms, failed, bucket);

        const name =
          item.envelope.tags?.['ai.operation.name'] ??
          (bd?.name as string | undefined) ??
          (bd?.url as string | undefined) ??
          '(unnamed)';
        let acc = requests.get(name);
        if (!acc) requests.set(name, (acc = newAccumulator(bucketCount)));
        record(acc, ms, failed, bucket);

        const code = String(bd?.responseCode ?? '—');
        const entry = codes.get(code);
        if (entry) entry.count++;
        else codes.set(code, { count: 1, failed });

        if (bucket >= 0) {
          const role = statusRole(code);
          outcomes[bucket][role]++;
          outcomes[bucket].total++;
        }

        if (ms !== undefined) bin(latency, ms);
        break;
      }

      case 'Dependency': {
        const ms = parseDurationMs(bd?.duration as string | undefined);
        const failed = bd?.success === false;
        record(allDependencies, ms, failed, bucket);

        const target = (bd?.target as string | undefined) || (bd?.name as string | undefined) || '(unknown)';
        let acc = dependencies.get(target);
        if (!acc) dependencies.set(target, (acc = newAccumulator(bucketCount)));
        acc.detail = (bd?.type as string | undefined) ?? acc.detail;
        record(acc, ms, failed, bucket);
        if (ms !== undefined) bin(dependencyLatency, ms);
        break;
      }

      case 'Exception': {
        exceptionCount++;
        const data = bd as unknown as ExceptionData | undefined;
        const first = data?.exceptions?.[0];
        const key = data?.problemId || first?.typeName || '(unknown)';
        const existing = exceptions.get(key);
        if (existing) {
          existing.row.count++;
          if (item.timestamp > existing.row.lastSeen) existing.row.lastSeen = item.timestamp;
        } else {
          exceptions.set(key, {
            row: {
              key,
              typeName: first?.typeName ?? '(unknown)',
              count: 1,
              lastSeen: item.timestamp,
              sampleMessage: first?.message ?? '',
            },
          });
        }
        break;
      }

      case 'Trace': {
        traceCount++;
        const severity = typeof bd?.severityLevel === 'number' ? bd.severityLevel : 1;
        if (severity >= 2) tracesAtWarning++;

        const props = bd?.properties as Record<string, string> | undefined;
        const category = props?.CategoryName ?? '(uncategorised)';
        let row = traces.get(category);
        if (!row) traces.set(category, (row = { category, total: 0, bySeverity: [0, 0, 0, 0, 0] }));
        row.total++;
        if (severity >= 0 && severity <= 4) row.bySeverity[severity]++;
        break;
      }
    }
  }

  const traceRows = Array.from(traces.values());
  // Noisiest first, but a category with errors outranks a chattier quiet one.
  traceRows.sort(
    (a, b) =>
      b.bySeverity[3] + b.bySeverity[4] - (a.bySeverity[3] + a.bySeverity[4]) || b.total - a.total,
  );

  return {
    totals: {
      items: items.length,
      requests: allRequests.count,
      failedRequests: allRequests.failed,
      dependencies: allDependencies.count,
      failedDependencies: allDependencies.failed,
      exceptions: exceptionCount,
      traces: traceCount,
      tracesAtWarningOrAbove: tracesAtWarning,
    },
    requestDuration: summarise(allRequests),
    dependencyDuration: summarise(allDependencies),
    span: from && to ? { from, to } : null,
    buckets,
    bucketMs,
    outcomes,
    latency,
    dependencyLatency,
    requestsByOperation: toRows(requests),
    dependenciesByTarget: toRows(dependencies),
    exceptionsByProblem: Array.from(exceptions.values())
      .map((e) => e.row)
      .sort((a, b) => b.count - a.count || (a.lastSeen < b.lastSeen ? 1 : -1))
      .slice(0, MAX_ROWS),
    tracesByCategory: traceRows.slice(0, MAX_ROWS),
    responseCodes: Array.from(codes.entries())
      .map(([code, v]) => ({ code, count: v.count, failed: v.failed }))
      .sort((a, b) => b.count - a.count),
  };
}

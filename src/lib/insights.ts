import { parseDurationMs } from './types';
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
  requestsByOperation: GroupRow[];
  dependenciesByTarget: GroupRow[];
  exceptionsByProblem: ExceptionRow[];
  tracesByCategory: TraceRow[];
  responseCodes: { code: string; count: number; failed: boolean }[];
}

const MAX_ROWS = 50;

interface Accumulator {
  count: number;
  failed: number;
  total: number;
  max: number;
  durations: number[];
  detail?: string;
}

function newAccumulator(): Accumulator {
  return { count: 0, failed: 0, total: 0, max: 0, durations: [] };
}

function record(acc: Accumulator, ms: number | undefined, failed: boolean): void {
  acc.count++;
  if (failed) acc.failed++;
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
    rows.push({ key, detail: acc.detail, ...summarise(acc) });
  }
  // Slowest first — the reason to open this page is usually "what is slow".
  rows.sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);
  return rows.slice(0, MAX_ROWS);
}

function baseDataOf(item: TelemetryItem): Record<string, unknown> | undefined {
  return item.envelope.data?.baseData as unknown as Record<string, unknown> | undefined;
}

export function computeInsights(items: TelemetryItem[]): Insights {
  const requests = new Map<string, Accumulator>();
  const dependencies = new Map<string, Accumulator>();
  const exceptions = new Map<string, { row: ExceptionRow }>();
  const traces = new Map<string, TraceRow>();
  const codes = new Map<string, { count: number; failed: boolean }>();

  const allRequests = newAccumulator();
  const allDependencies = newAccumulator();
  let exceptionCount = 0;
  let traceCount = 0;
  let tracesAtWarning = 0;
  let from = '';
  let to = '';

  for (const item of items) {
    if (!from || item.timestamp < from) from = item.timestamp;
    if (!to || item.timestamp > to) to = item.timestamp;

    const bd = baseDataOf(item);

    switch (item.type) {
      case 'Request': {
        const ms = parseDurationMs(bd?.duration as string | undefined);
        const failed = bd?.success === false;
        record(allRequests, ms, failed);

        const name =
          item.envelope.tags?.['ai.operation.name'] ??
          (bd?.name as string | undefined) ??
          (bd?.url as string | undefined) ??
          '(unnamed)';
        let acc = requests.get(name);
        if (!acc) requests.set(name, (acc = newAccumulator()));
        record(acc, ms, failed);

        const code = String(bd?.responseCode ?? '—');
        const entry = codes.get(code);
        if (entry) entry.count++;
        else codes.set(code, { count: 1, failed });
        break;
      }

      case 'Dependency': {
        const ms = parseDurationMs(bd?.duration as string | undefined);
        const failed = bd?.success === false;
        record(allDependencies, ms, failed);

        const target = (bd?.target as string | undefined) || (bd?.name as string | undefined) || '(unknown)';
        let acc = dependencies.get(target);
        if (!acc) dependencies.set(target, (acc = newAccumulator()));
        acc.detail = (bd?.type as string | undefined) ?? acc.detail;
        record(acc, ms, failed);
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

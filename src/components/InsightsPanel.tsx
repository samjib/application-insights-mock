'use client';

import { useMemo } from 'react';
import { formatDuration } from '@/lib/types';
import { computeInsights, type DurationStats, type Insights } from '@/lib/insights';
import { SERIES, SERIES_LABEL, STACK_ORDER, STATUS } from '@/lib/chart-theme';
import ChartCard from './charts/ChartCard';
import Histogram, { type HistogramBin } from './charts/Histogram';
import Sparkline from './charts/Sparkline';
import StackedColumns, { type ColumnSeries } from './charts/StackedColumns';
import type { TelemetryItem } from '@/lib/types';

interface InsightsPanelProps {
  items: TelemetryItem[];
  /** Opens a list view scoped to the clicked row. */
  onDrillDown: (viewId: string, query: string) => void;
  /** Shown above the tiles when a search or filter is narrowing the numbers. */
  scopeLabel: string | null;
}

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

function formatCount(n: number): string {
  return n < 10_000 ? n.toLocaleString('en-GB') : compact.format(n);
}

function ms(value: number): string {
  return formatDuration(value) ?? '—';
}

function percent(part: number, whole: number): string {
  if (whole === 0) return '0%';
  const pct = (part / whole) * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

/** Short form for axis ticks, where "2.50 s" is more precision than the label needs. */
function msShort(value: number): string {
  if (value === 0) return '0';
  if (value < 1000) return `${value % 1 === 0 ? value : value.toFixed(1)}ms`;
  const seconds = value / 1000;
  return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`;
}

/** Quotes a value so it survives the search parser as a single scoped term. */
function scopedQuery(field: string, value: string): string {
  return `${field}:"${value.replace(/"/g, '')}"`;
}

function Tile({
  label,
  value,
  secondary,
  tone = 'neutral',
  trend,
  trendColor,
}: {
  label: string;
  value: string;
  secondary?: string;
  tone?: 'neutral' | 'good' | 'warning' | 'critical';
  trend?: number[];
  trendColor?: string;
}) {
  const secondaryTone = {
    neutral: 'text-gray-500 dark:text-gray-400',
    good: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    critical: 'text-red-600 dark:text-red-400',
  }[tone];

  return (
    <div
      className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2.5"
      style={{ ['--chart-surface' as string]: 'var(--color-gray-900, #111827)' }}
    >
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="flex items-end justify-between gap-2">
        {/* Proportional figures: tabular-nums makes a standalone number look loose. */}
        <div className="mt-0.5 text-2xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
          {value}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline
            values={trend}
            color={trendColor ?? SERIES.Other}
            width={72}
            height={26}
            label={`${label} over time`}
          />
        )}
      </div>
      {secondary && <div className={`mt-0.5 text-[11px] ${secondaryTone}`}>{secondary}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline gap-2 mb-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h2>
        {subtitle && <span className="text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</span>}
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">{children}</div>
      </div>
    </section>
  );
}

const TH = 'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap';
const TD = 'px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap';
const TD_NUM = `${TD} text-right tabular-nums`;
const ROW = 'border-t border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 cursor-pointer';

function DurationHeaders() {
  return (
    <>
      <th className={`${TH} text-left`}>Trend</th>
      <th className={`${TH} text-right`}>Count</th>
      <th className={`${TH} text-right`}>Failed</th>
      <th className={`${TH} text-right`}>Avg</th>
      <th className={`${TH} text-right`} title="95th percentile">p95</th>
      <th className={`${TH} text-right`}>Max</th>
    </>
  );
}

function DurationCells({ row, color }: { row: DurationStats & { trend?: number[] }; color: string }) {
  return (
    <>
      <td className={`${TD} w-24`}>
        {row.trend && row.trend.length > 1 ? (
          <Sparkline values={row.trend} color={color} width={72} height={18} label="Volume over time" />
        ) : (
          <span className="text-gray-400 dark:text-gray-600">—</span>
        )}
      </td>
      <td className={TD_NUM}>{row.count.toLocaleString('en-GB')}</td>
      <td className={TD_NUM}>
        {row.failed > 0 ? (
          <span className="text-red-600 dark:text-red-400">
            {row.failed.toLocaleString('en-GB')} ({percent(row.failed, row.count)})
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">—</span>
        )}
      </td>
      <td className={TD_NUM}>{ms(row.avgMs)}</td>
      <td className={`${TD_NUM} font-medium text-gray-900 dark:text-gray-100`}>{ms(row.p95Ms)}</td>
      <td className={TD_NUM}>{ms(row.maxMs)}</td>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-3">📈</div>
        <div className="text-base font-medium text-gray-600 dark:text-gray-300">
          Nothing to summarise yet
        </div>
        <p className="text-sm mt-2 text-gray-500 dark:text-gray-400">
          Once telemetry arrives this page breaks it down by operation, dependency, exception and
          log category.
        </p>
      </div>
    </div>
  );
}

/** Verbose and Information are context, not state, so they stay neutral gray. */
const SEVERITY_FILL = ['#4b5563', '#6b7280', STATUS.warning, STATUS.critical, '#7f1d1d'];

const SEVERITY_COLUMNS: { label: string; title: string; tone: string }[] = [
  { label: 'VRB', title: 'Verbose', tone: 'text-gray-400 dark:text-gray-600' },
  { label: 'INF', title: 'Information', tone: 'text-gray-500 dark:text-gray-400' },
  { label: 'WRN', title: 'Warning', tone: 'text-amber-600 dark:text-amber-400' },
  { label: 'ERR', title: 'Error', tone: 'text-red-600 dark:text-red-400' },
  { label: 'CRT', title: 'Critical', tone: 'text-red-700 dark:text-red-300 font-semibold' },
];

export default function InsightsPanel({ items, onDrillDown, scopeLabel }: InsightsPanelProps) {
  const insights: Insights = useMemo(() => computeInsights(items), [items]);
  const { totals, span } = insights;

  const seriesIndex = useMemo(
    () => Object.fromEntries(STACK_ORDER.map((k, i) => [k, i])) as Record<string, number>,
    [],
  );

  const volumeSeries: ColumnSeries[] = useMemo(
    () => STACK_ORDER.map((key) => ({ key, label: SERIES_LABEL[key], color: SERIES[key] })),
    [],
  );

  const volumeData = useMemo(
    () => insights.buckets.map((b) => ({ from: b.from, values: b.counts })),
    [insights.buckets],
  );

  // Present only the series that actually occur, so the legend never lists an
  // empty one and the palette's adjacency is preserved for those that remain.
  const activeVolumeSeries = useMemo(() => {
    const totalsPerSeries = STACK_ORDER.map((_, i) =>
      insights.buckets.reduce((sum, b) => sum + b.counts[i], 0),
    );
    return volumeSeries.map((s, i) => ({ ...s, total: totalsPerSeries[i] })).filter((s) => s.total > 0);
  }, [insights.buckets, volumeSeries]);

  const outcomeSeries: ColumnSeries[] = useMemo(
    () => [
      { key: 'good', label: '2xx/3xx', color: STATUS.good },
      { key: 'warning', label: '4xx', color: STATUS.warning },
      { key: 'critical', label: '5xx', color: STATUS.critical },
      { key: 'serious', label: 'other', color: STATUS.serious },
    ],
    [],
  );

  const outcomeData = useMemo(
    () =>
      insights.outcomes.map((o) => ({
        from: o.from,
        values: [o.good, o.warning, o.critical, o.serious],
      })),
    [insights.outcomes],
  );

  const latencyBins: HistogramBin[] = useMemo(
    () =>
      insights.latency.map((bin) => ({
        // Ticks mark the bucket's lower edge, so each label is unambiguous.
        label: bin.to === Infinity ? `${msShort(bin.from)}+` : msShort(bin.from),
        range:
          bin.to === Infinity
            ? `${ms(bin.from)} and slower`
            : `${ms(bin.from)} to ${ms(bin.to)}`,
        count: bin.count,
      })),
    [insights.latency],
  );

  // Series-level trends for the tiles, summed from the shared bucket axis.
  const trendFor = (key: keyof typeof SERIES) =>
    insights.buckets.map((b) => b.counts[seriesIndex[key]] ?? 0);
  const totalTrend = insights.buckets.map((b) => b.total);

  if (items.length === 0) return <EmptyState />;

  const spanLabel = span
    ? (() => {
        const from = new Date(span.from).getTime();
        const to = new Date(span.to).getTime();
        const seconds = Math.max(0, (to - from) / 1000);
        if (seconds < 90) return `${Math.round(seconds)}s`;
        if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
      })()
    : '—';

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {scopeLabel && (
        <div className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
          Summarising <span className="text-gray-800 dark:text-gray-200">{scopeLabel}</span> —
          clear the filters to summarise everything.
        </div>
      )}

      <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Items in view"
          value={formatCount(totals.items)}
          secondary={`over ${spanLabel}`}
          trend={totalTrend}
          trendColor={SERIES.Other}
        />
        <Tile
          label="Requests"
          value={formatCount(totals.requests)}
          secondary={
            totals.requests === 0
              ? undefined
              : totals.failedRequests > 0
                ? `${totals.failedRequests.toLocaleString('en-GB')} failed (${percent(totals.failedRequests, totals.requests)})`
                : 'all succeeded'
          }
          tone={totals.failedRequests > 0 ? 'critical' : 'good'}
          trend={trendFor('Request')}
          trendColor={SERIES.Request}
        />
        <Tile
          label="Request p95"
          value={totals.requests ? ms(insights.requestDuration.p95Ms) : '—'}
          secondary={totals.requests ? `max ${ms(insights.requestDuration.maxMs)}` : undefined}
        />
        <Tile
          label="Dependencies"
          value={formatCount(totals.dependencies)}
          secondary={
            totals.dependencies === 0
              ? undefined
              : totals.failedDependencies > 0
                ? `${totals.failedDependencies.toLocaleString('en-GB')} failed (${percent(totals.failedDependencies, totals.dependencies)})`
                : 'all succeeded'
          }
          tone={totals.failedDependencies > 0 ? 'critical' : 'good'}
          trend={trendFor('Dependency')}
          trendColor={SERIES.Dependency}
        />
        <Tile
          label="Exceptions"
          value={formatCount(totals.exceptions)}
          secondary={
            totals.exceptions > 0
              ? `${insights.exceptionsByProblem.length} distinct`
              : 'none captured'
          }
          tone={totals.exceptions > 0 ? 'critical' : 'good'}
          trend={trendFor('Exception')}
          trendColor={SERIES.Exception}
        />
        <Tile
          label="Traces"
          value={formatCount(totals.traces)}
          secondary={
            totals.tracesAtWarningOrAbove > 0
              ? `${totals.tracesAtWarningOrAbove.toLocaleString('en-GB')} at warning or above`
              : totals.traces > 0
                ? 'none above information'
                : undefined
          }
          tone={totals.tracesAtWarningOrAbove > 0 ? 'warning' : 'neutral'}
          trend={trendFor('Trace')}
          trendColor={SERIES.Trace}
        />
      </div>

      <div className="mt-3 grid gap-2 grid-cols-1 xl:grid-cols-3">
        <ChartCard
          title="Telemetry over time"
          subtitle={`${formatDuration(insights.bucketMs)} buckets`}
          legend={activeVolumeSeries.map((s) => ({
            key: s.key,
            label: s.label,
            color: s.color,
            value: formatCount(s.total),
          }))}
          className="xl:col-span-2"
        >
          <StackedColumns
            data={volumeData}
            series={volumeSeries}
            bucketMs={insights.bucketMs}
            valueLabel="items"
            emptyMessage="No telemetry in range"
          />
        </ChartCard>

        <ChartCard
          title="Request latency"
          subtitle="distribution"
        >
          {/* No click-through: the query language cannot express a latency range,
              and a drill-down that silently ignored the bucket would mislead. */}
          <Histogram bins={latencyBins} emptyMessage="No requests captured" />
        </ChartCard>
      </div>

      {totals.requests > 0 && (
        <div className="mt-2">
          <ChartCard
            title="Request outcomes over time"
            subtitle="by response code class"
            legend={outcomeSeries
              .map((s, i) => ({
                key: s.key,
                label: s.label,
                color: s.color,
                value: formatCount(outcomeData.reduce((sum, d) => sum + d.values[i], 0)),
              }))
              .filter((s) => s.value !== '0')}
          >
            <StackedColumns
              data={outcomeData}
              series={outcomeSeries}
              bucketMs={insights.bucketMs}
              valueLabel="requests"
              height={150}
              emptyMessage="No requests in range"
            />
          </ChartCard>
        </div>
      )}

      {insights.requestsByOperation.length > 0 && (
        <Section title="Requests by operation" subtitle="slowest first · click to open in Requests">
          {insights.responseCodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              {insights.responseCodes.map(({ code, count, failed }) => (
                <button
                  key={code}
                  onClick={() => onDrillDown('requests', scopedQuery('code', code))}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    failed
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={`${count.toLocaleString('en-GB')} responses with code ${code}`}
                >
                  {code} <span className="tabular-nums opacity-70">{count.toLocaleString('en-GB')}</span>
                </button>
              ))}
            </div>
          )}
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className={`${TH} text-left`}>Operation</th>
                <DurationHeaders />
              </tr>
            </thead>
            <tbody>
              {insights.requestsByOperation.map((row) => (
                <tr
                  key={row.key}
                  className={ROW}
                  onClick={() => onDrillDown('requests', scopedQuery('op', row.key))}
                >
                  <td className={`${TD} max-w-md truncate`} title={row.key}>{row.key}</td>
                  <DurationCells row={row} color={SERIES.Request} />
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {insights.dependenciesByTarget.length > 0 && (
        <Section title="Dependencies by target" subtitle="slowest first · click to open in Dependencies">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className={`${TH} text-left`}>Target</th>
                <th className={`${TH} text-left`}>Type</th>
                <DurationHeaders />
              </tr>
            </thead>
            <tbody>
              {insights.dependenciesByTarget.map((row) => (
                <tr
                  key={row.key}
                  className={ROW}
                  onClick={() => onDrillDown('dependencies', scopedQuery('target', row.key))}
                >
                  <td className={`${TD} max-w-sm truncate`} title={row.key}>{row.key}</td>
                  <td className={`${TD} text-gray-500 dark:text-gray-400`}>{row.detail ?? '—'}</td>
                  <DurationCells row={row} color={SERIES.Dependency} />
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {insights.exceptionsByProblem.length > 0 && (
        <Section title="Exceptions" subtitle="most frequent first · click to open in Exceptions">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className={`${TH} text-left`}>Problem</th>
                <th className={`${TH} text-left`}>Latest message</th>
                <th className={`${TH} text-right`}>Count</th>
                <th className={`${TH} text-right`}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {insights.exceptionsByProblem.map((row) => (
                <tr
                  key={row.key}
                  className={ROW}
                  onClick={() => onDrillDown('exceptions', scopedQuery('exception', row.typeName))}
                >
                  <td className={`${TD} max-w-sm truncate text-red-600 dark:text-red-400`} title={row.key}>
                    {row.key}
                  </td>
                  <td
                    className={`${TD} max-w-md truncate text-gray-500 dark:text-gray-400`}
                    title={row.sampleMessage}
                  >
                    {row.sampleMessage || '—'}
                  </td>
                  <td className={TD_NUM}>{row.count.toLocaleString('en-GB')}</td>
                  <td className={`${TD_NUM} text-gray-500 dark:text-gray-400`}>
                    {new Date(row.lastSeen).toLocaleTimeString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {insights.tracesByCategory.length > 0 && (
        <Section title="Log categories" subtitle="most errors first · click to open in Traces">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr>
                <th className={`${TH} text-left`}>Category</th>
                <th className={`${TH} text-left`}>Mix</th>
                <th className={`${TH} text-right`}>Total</th>
                {SEVERITY_COLUMNS.map((s) => (
                  <th key={s.label} className={`${TH} text-right`} title={s.title}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {insights.tracesByCategory.map((row) => (
                <tr
                  key={row.category}
                  className={ROW}
                  onClick={() => onDrillDown('traces', scopedQuery('cat', row.category))}
                >
                  <td className={`${TD} max-w-lg truncate font-mono`} title={row.category}>
                    {row.category}
                  </td>
                  <td className={`${TD} w-28`}>
                    <span className="flex h-2 w-24 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                      {row.bySeverity.map((n, i) =>
                        n > 0 ? (
                          <span
                            key={i}
                            style={{ width: `${(n / row.total) * 100}%`, background: SEVERITY_FILL[i] }}
                            title={`${n} ${SEVERITY_COLUMNS[i].title}`}
                          />
                        ) : null,
                      )}
                    </span>
                  </td>
                  <td className={TD_NUM}>{row.total.toLocaleString('en-GB')}</td>
                  {SEVERITY_COLUMNS.map((s, i) => (
                    <td key={s.label} className={TD_NUM}>
                      {row.bySeverity[i] > 0 ? (
                        <span className={s.tone}>{row.bySeverity[i].toLocaleString('en-GB')}</span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-700">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

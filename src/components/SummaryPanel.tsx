'use client';

import { useMemo } from 'react';
import { formatDuration } from '@/lib/types';
import { computeInsights, type DurationStats, type Insights } from '@/lib/insights';
import { SERIES, SERIES_LABEL, STACK_ORDER, STATUS } from '@/lib/chart-theme';
import type { TelemetryView } from '@/lib/views';
import ChartCard from './charts/ChartCard';
import Histogram, { type HistogramBin } from './charts/Histogram';
import Sparkline from './charts/Sparkline';
import StackedColumns, { type ColumnSeries } from './charts/StackedColumns';
import type { TelemetryItem } from '@/lib/types';

interface SummaryPanelProps {
  /** Already scoped to the active view and its filters, so this describes the list below it. */
  items: TelemetryItem[];
  view: TelemetryView;
  collapsed: boolean;
  onToggle: () => void;
  /** Opens a list scoped to a clicked row. */
  onDrillDown: (query: string) => void;
}

const CHART_HEIGHT = 132;
const TOP_ROWS = 5;

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

function formatCount(n: number): string {
  return n < 10_000 ? n.toLocaleString('en-GB') : compact.format(n);
}

function ms(value: number): string {
  return formatDuration(value) ?? '—';
}

function msShort(value: number): string {
  if (value === 0) return '0';
  if (value < 1000) return `${value % 1 === 0 ? value : value.toFixed(1)}ms`;
  const seconds = value / 1000;
  return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`;
}

function percent(part: number, whole: number): string {
  if (whole === 0) return '0%';
  const pct = (part / whole) * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function scopedQuery(field: string, value: string): string {
  return `${field}:"${value.replace(/"/g, '')}"`;
}

function toBins(bins: Insights['latency']): HistogramBin[] {
  return bins.map((b) => ({
    label: b.to === Infinity ? `${msShort(b.from)}+` : msShort(b.from),
    range: b.to === Infinity ? `${ms(b.from)} and slower` : `${ms(b.from)} to ${ms(b.to)}`,
    count: b.count,
  }));
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
      className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2"
      style={{ ['--chart-surface' as string]: 'var(--color-gray-900, #111827)' }}
    >
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="flex items-end justify-between gap-2">
        {/* Proportional figures: tabular-nums makes a standalone number look loose. */}
        <div className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
          {value}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline values={trend} color={trendColor ?? SERIES.Other} width={64} height={22} label={`${label} over time`} />
        )}
      </div>
      {secondary && <div className={`text-[11px] ${secondaryTone}`}>{secondary}</div>}
    </div>
  );
}

const TH = 'px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap';
const TD = 'px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap';
const TD_NUM = `${TD} text-right tabular-nums`;
const ROW = 'border-t border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 cursor-pointer';

function TopTable({
  title,
  headers,
  children,
}: {
  title: string;
  headers: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>{headers}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function DurationCells({ row }: { row: DurationStats }) {
  return (
    <>
      <td className={TD_NUM}>{row.count.toLocaleString('en-GB')}</td>
      <td className={TD_NUM}>
        {row.failed > 0 ? (
          <span className="text-red-600 dark:text-red-400">{percent(row.failed, row.count)}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">—</span>
        )}
      </td>
      <td className={`${TD_NUM} font-medium text-gray-900 dark:text-gray-100`}>{ms(row.p95Ms)}</td>
    </>
  );
}

export default function SummaryPanel({ items, view, collapsed, onToggle, onDrillDown }: SummaryPanelProps) {
  const insights: Insights = useMemo(
    () => computeInsights(collapsed ? [] : items),
    [items, collapsed],
  );

  const volumeSeries: ColumnSeries[] = useMemo(
    () => STACK_ORDER.map((key) => ({ key, label: SERIES_LABEL[key], color: SERIES[key] })),
    [],
  );

  const volumeData = useMemo(
    () => insights.buckets.map((b) => ({ from: b.from, values: b.counts })),
    [insights.buckets],
  );

  const activeVolumeSeries = useMemo(() => {
    const perSeries = STACK_ORDER.map((_, i) => insights.buckets.reduce((sum, b) => sum + b.counts[i], 0));
    return volumeSeries.map((s, i) => ({ ...s, total: perSeries[i] })).filter((s) => s.total > 0);
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
    () => insights.outcomes.map((o) => ({ from: o.from, values: [o.good, o.warning, o.critical, o.serious] })),
    [insights.outcomes],
  );

  const seriesIndex = useMemo(
    () => Object.fromEntries(STACK_ORDER.map((k, i) => [k, i])) as Record<string, number>,
    [],
  );
  const trendFor = (key: keyof typeof SERIES) => insights.buckets.map((b) => b.counts[seriesIndex[key]] ?? 0);
  const totalTrend = insights.buckets.map((b) => b.total);

  const header = (
    <button
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer transition-colors"
      title={collapsed ? 'Show the summary for this view' : 'Hide the summary'}
    >
      <svg
        className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      <span>Summary</span>
    </button>
  );

  // Nothing to summarise: let the list's own empty state own the screen rather
  // than leaving a toggle above a blank panel.
  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
        {header}
      </div>
    );
  }

  const { totals } = insights;
  const isRequests = view.id === 'requests';
  const isDependencies = view.id === 'dependencies';
  const isExceptions = view.id === 'exceptions';
  const isTraces = view.id === 'traces';
  const isAll = view.types === null;

  return (
    <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
      {header}
      <div className="px-3 pb-3 grid gap-2 lg:grid-cols-2 2xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,26rem)] items-start">
        {/* Tiles: only the measures that mean something for what is on screen. */}
        <div className="grid gap-2 grid-cols-2">
          {isAll && (
            <>
              <Tile label="Items" value={formatCount(totals.items)} trend={totalTrend} trendColor={SERIES.Other} />
              <Tile
                label="Exceptions"
                value={formatCount(totals.exceptions)}
                secondary={totals.exceptions > 0 ? `${insights.exceptionsByProblem.length} distinct` : 'none'}
                tone={totals.exceptions > 0 ? 'critical' : 'good'}
                trend={trendFor('Exception')}
                trendColor={SERIES.Exception}
              />
            </>
          )}
          {isRequests && (
            <>
              <Tile
                label="Requests"
                value={formatCount(totals.requests)}
                secondary={
                  totals.failedRequests > 0
                    ? `${totals.failedRequests.toLocaleString('en-GB')} failed (${percent(totals.failedRequests, totals.requests)})`
                    : 'all succeeded'
                }
                tone={totals.failedRequests > 0 ? 'critical' : 'good'}
                trend={trendFor('Request')}
                trendColor={SERIES.Request}
              />
              <Tile label="p95" value={ms(insights.requestDuration.p95Ms)} secondary={`max ${ms(insights.requestDuration.maxMs)}`} />
            </>
          )}
          {isDependencies && (
            <>
              <Tile
                label="Dependencies"
                value={formatCount(totals.dependencies)}
                secondary={
                  totals.failedDependencies > 0
                    ? `${totals.failedDependencies.toLocaleString('en-GB')} failed (${percent(totals.failedDependencies, totals.dependencies)})`
                    : 'all succeeded'
                }
                tone={totals.failedDependencies > 0 ? 'critical' : 'good'}
                trend={trendFor('Dependency')}
                trendColor={SERIES.Dependency}
              />
              <Tile label="p95" value={ms(insights.dependencyDuration.p95Ms)} secondary={`max ${ms(insights.dependencyDuration.maxMs)}`} />
            </>
          )}
          {isExceptions && (
            <>
              <Tile
                label="Exceptions"
                value={formatCount(totals.exceptions)}
                tone={totals.exceptions > 0 ? 'critical' : 'good'}
                trend={trendFor('Exception')}
                trendColor={SERIES.Exception}
              />
              <Tile label="Distinct problems" value={formatCount(insights.exceptionsByProblem.length)} />
            </>
          )}
          {isTraces && (
            <>
              <Tile
                label="Traces"
                value={formatCount(totals.traces)}
                secondary={
                  totals.tracesAtWarningOrAbove > 0
                    ? `${totals.tracesAtWarningOrAbove.toLocaleString('en-GB')} at warning or above`
                    : 'none above information'
                }
                tone={totals.tracesAtWarningOrAbove > 0 ? 'warning' : 'neutral'}
                trend={trendFor('Trace')}
                trendColor={SERIES.Trace}
              />
              <Tile label="Categories" value={formatCount(insights.tracesByCategory.length)} />
            </>
          )}
          {!isAll && !isRequests && !isDependencies && !isExceptions && !isTraces && (
            <Tile label="Items" value={formatCount(totals.items)} trend={totalTrend} trendColor={SERIES.Other} />
          )}
        </div>

        {/* Charts: at most two, chosen for what this view is about. */}
        <div className="grid gap-2 md:grid-cols-2 min-w-0">
          {isRequests ? (
            <>
              <ChartCard
                title="Outcomes over time"
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
                  height={CHART_HEIGHT}
                  emptyMessage="No requests in range"
                />
              </ChartCard>
              <ChartCard title="Latency" subtitle="distribution">
                      <Histogram
                  bins={toBins(insights.latency)}
                  label="Request latency distribution"
                  height={CHART_HEIGHT}
                  emptyMessage="No requests captured"
                />
              </ChartCard>
            </>
          ) : isDependencies ? (
            <>
              <ChartCard title="Volume over time" legend={activeVolumeSeries}>
                <StackedColumns
                  data={volumeData}
                  series={volumeSeries}
                  bucketMs={insights.bucketMs}
                  valueLabel="items"
                  height={CHART_HEIGHT}
                  emptyMessage="Nothing in range"
                />
              </ChartCard>
              <ChartCard title="Latency" subtitle="distribution">
                <Histogram
                  bins={toBins(insights.dependencyLatency)}
                  label="Dependency latency distribution"
                  height={CHART_HEIGHT}
                  emptyMessage="No dependencies captured"
                />
              </ChartCard>
            </>
          ) : (
            <ChartCard
              title="Volume over time"
              subtitle={`${formatDuration(insights.bucketMs)} buckets`}
              legend={activeVolumeSeries}
              className="md:col-span-2"
            >
              <StackedColumns
                data={volumeData}
                series={volumeSeries}
                bucketMs={insights.bucketMs}
                valueLabel="items"
                height={CHART_HEIGHT}
                emptyMessage="Nothing in range"
              />
            </ChartCard>
          )}
        </div>

        {/* One breakdown, capped — the list below carries the individual items. */}
        <div className="min-w-0">
          {(isRequests || isAll) && insights.requestsByOperation.length > 0 && (
            <TopTable
              title={`Slowest ${isAll ? 'request ' : ''}operations · top ${Math.min(TOP_ROWS, insights.requestsByOperation.length)}`}
              headers={
                <>
                  <th className={`${TH} text-left`}>Operation</th>
                  <th className={`${TH} text-right`}>Count</th>
                  <th className={`${TH} text-right`}>Failed</th>
                  <th className={`${TH} text-right`}>p95</th>
                </>
              }
            >
              {insights.requestsByOperation.slice(0, TOP_ROWS).map((row) => (
                <tr key={row.key} className={ROW} onClick={() => onDrillDown(scopedQuery('op', row.key))}>
                  <td className={`${TD} max-w-52 truncate`} title={row.key}>{row.key}</td>
                  <DurationCells row={row} />
                </tr>
              ))}
            </TopTable>
          )}

          {isDependencies && insights.dependenciesByTarget.length > 0 && (
            <TopTable
              title={`Slowest targets · top ${Math.min(TOP_ROWS, insights.dependenciesByTarget.length)}`}
              headers={
                <>
                  <th className={`${TH} text-left`}>Target</th>
                  <th className={`${TH} text-right`}>Count</th>
                  <th className={`${TH} text-right`}>Failed</th>
                  <th className={`${TH} text-right`}>p95</th>
                </>
              }
            >
              {insights.dependenciesByTarget.slice(0, TOP_ROWS).map((row) => (
                <tr key={row.key} className={ROW} onClick={() => onDrillDown(scopedQuery('target', row.key))}>
                  <td className={`${TD} max-w-52 truncate`} title={row.key}>
                    {row.key}
                    {row.detail && <span className="ml-1.5 text-gray-500 dark:text-gray-500">{row.detail}</span>}
                  </td>
                  <DurationCells row={row} />
                </tr>
              ))}
            </TopTable>
          )}

          {isExceptions && insights.exceptionsByProblem.length > 0 && (
            <TopTable
              title={`Most frequent · top ${Math.min(TOP_ROWS, insights.exceptionsByProblem.length)}`}
              headers={
                <>
                  <th className={`${TH} text-left`}>Problem</th>
                  <th className={`${TH} text-right`}>Count</th>
                </>
              }
            >
              {insights.exceptionsByProblem.slice(0, TOP_ROWS).map((row) => (
                <tr
                  key={row.key}
                  className={ROW}
                  onClick={() => onDrillDown(scopedQuery('exception', row.typeName))}
                >
                  <td className={`${TD} max-w-72 truncate text-red-600 dark:text-red-400`} title={`${row.key} — ${row.sampleMessage}`}>
                    {row.key}
                  </td>
                  <td className={TD_NUM}>{row.count.toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </TopTable>
          )}

          {isTraces && insights.tracesByCategory.length > 0 && (
            <TopTable
              title={`Noisiest categories · top ${Math.min(TOP_ROWS, insights.tracesByCategory.length)}`}
              headers={
                <>
                  <th className={`${TH} text-left`}>Category</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={`${TH} text-right`}>Warn</th>
                  <th className={`${TH} text-right`}>Error</th>
                </>
              }
            >
              {insights.tracesByCategory.slice(0, TOP_ROWS).map((row) => (
                <tr
                  key={row.category}
                  className={ROW}
                  onClick={() => onDrillDown(scopedQuery('cat', row.category))}
                >
                  <td className={`${TD} max-w-52 truncate font-mono`} title={row.category}>{row.category}</td>
                  <td className={TD_NUM}>{row.total.toLocaleString('en-GB')}</td>
                  <td className={TD_NUM}>
                    {row.bySeverity[2] > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">{row.bySeverity[2]}</span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-700">—</span>
                    )}
                  </td>
                  <td className={TD_NUM}>
                    {row.bySeverity[3] + row.bySeverity[4] > 0 ? (
                      <span className="text-red-600 dark:text-red-400">
                        {row.bySeverity[3] + row.bySeverity[4]}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </TopTable>
          )}
        </div>
      </div>
    </div>
  );
}
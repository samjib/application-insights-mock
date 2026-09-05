'use client';

import { TelemetryItem, ColumnDef, extractColumnValue } from '@/lib/types';

// Rows are a fixed height so the list can be virtualised without measuring.
export const ROW_HEIGHT = 32;

const TYPE_BADGE_COLORS: Record<string, string> = {
  Request: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  Dependency: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  Trace: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  Exception: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  Event: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  Metric: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  Availability: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  PageView: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300',
  PageViewPerf: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
  Unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300',
};

const TYPE_BADGE_LABELS: Record<string, string> = {
  Request: 'REQ',
  Dependency: 'DEP',
  Trace: 'TRC',
  Exception: 'EXC',
  Event: 'EVT',
  Metric: 'MET',
  Availability: 'AVL',
  PageView: 'PV',
  PageViewPerf: 'PVP',
  Unknown: '?',
};

const SEVERITY_COLORS: Record<number, string> = {
  0: 'text-gray-400',    // Verbose
  1: 'text-blue-500',    // Information
  2: 'text-yellow-500',  // Warning
  3: 'text-red-500',     // Error
  4: 'text-red-700 font-bold', // Critical
};

const SEVERITY_LABELS: Record<number, string> = {
  0: 'VRB',
  1: 'INF',
  2: 'WRN',
  3: 'ERR',
  4: 'CRT',
};

function getSeverity(item: TelemetryItem): number | undefined {
  const bd = item.envelope.data?.baseData;
  if (!bd) return undefined;
  if ('severityLevel' in bd && typeof bd.severityLevel === 'number') {
    return bd.severityLevel;
  }
  return undefined;
}

function getSuccess(item: TelemetryItem): boolean | undefined {
  const bd = item.envelope.data?.baseData;
  if (!bd) return undefined;
  if ('success' in bd && typeof bd.success === 'boolean') {
    return bd.success;
  }
  return undefined;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }
function pad3(n: number): string { return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n); }

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
    if (isToday(d)) return time;
    return `${MONTHS[d.getMonth()]} ${pad2(d.getDate())} ${time}`;
  } catch {
    return iso;
  }
}

interface TelemetryItemRowProps {
  item: TelemetryItem;
  isSelected: boolean;
  onClick: (item: TelemetryItem) => void;
  extraColumns: ColumnDef[];
  gridTemplate: string;
}

export default function TelemetryItemRow({
  item,
  isSelected,
  onClick,
  extraColumns,
  gridTemplate,
}: TelemetryItemRowProps) {
  const severity = getSeverity(item);
  const success = getSuccess(item);
  const operation = item.envelope.tags?.['ai.operation.name'];

  return (
    <div
      id={`telemetry-row-${item.id}`}
      onClick={() => onClick(item)}
      style={{ height: ROW_HEIGHT, gridTemplateColumns: gridTemplate }}
      className={`grid items-center gap-2 px-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 text-sm ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-950 border-l-2 border-l-blue-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-l-transparent'
      } ${success === false ? 'bg-red-50/30 dark:bg-red-950/20' : ''}`}
    >
      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono tabular-nums truncate">
        {formatTime(item.timestamp)}
      </span>

      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-center ${
          TYPE_BADGE_COLORS[item.type] || TYPE_BADGE_COLORS.Unknown
        }`}
        title={item.type}
      >
        {TYPE_BADGE_LABELS[item.type] || '?'}
      </span>

      <span className={`text-[10px] font-mono ${severity !== undefined ? SEVERITY_COLORS[severity] ?? '' : ''}`}>
        {severity !== undefined ? SEVERITY_LABELS[severity] ?? '' : ''}
      </span>

      <span
        className={`text-xs text-center ${success === false ? 'text-red-500' : 'text-emerald-500'}`}
        title={success === undefined ? undefined : success ? 'Succeeded' : 'Failed'}
      >
        {success === undefined ? '' : success ? '✓' : '✗'}
      </span>

      <span className="truncate text-gray-700 dark:text-gray-300" title={item.summary}>
        {item.summary}
      </span>

      {extraColumns.map((col) => {
        const val = extractColumnValue(item, col);
        return (
          <span
            key={col.key}
            className="text-xs text-gray-400 dark:text-gray-500 truncate font-mono"
            title={`${col.label}: ${val ?? '—'}`}
          >
            {val ?? '—'}
          </span>
        );
      })}

      <span className="text-xs text-gray-400 dark:text-gray-500 truncate" title={operation}>
        {operation ?? ''}
      </span>
    </div>
  );
}

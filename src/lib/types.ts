// Application Insights Telemetry Envelope and Data Types
// Based on the public schema: https://github.com/microsoft/ApplicationInsights-dotnet/tree/master/BASE/Schema/PublicSchema

export type SeverityLevel = 'Verbose' | 'Information' | 'Warning' | 'Error' | 'Critical';

export const SEVERITY_LEVEL_MAP: Record<number, SeverityLevel> = {
  0: 'Verbose',
  1: 'Information',
  2: 'Warning',
  3: 'Error',
  4: 'Critical',
};

// --- Base Data Types ---

export interface RequestData {
  ver: number;
  id: string;
  name?: string;
  duration: string;
  responseCode: string;
  success: boolean;
  source?: string;
  url?: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface RemoteDependencyData {
  ver: number;
  name: string;
  id?: string;
  resultCode?: string;
  duration: string;
  success: boolean;
  data?: string;
  type?: string;
  target?: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface StackFrame {
  level: number;
  method: string;
  assembly?: string;
  fileName?: string;
  line?: number;
}

export interface ExceptionDetails {
  id: number;
  outerId: number;
  typeName: string;
  message: string;
  hasFullStack?: boolean;
  stack?: string;
  parsedStack?: StackFrame[];
}

export interface ExceptionData {
  ver: number;
  exceptions: ExceptionDetails[];
  severityLevel?: number;
  problemId?: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface MessageData {
  ver: number;
  message: string;
  severityLevel?: number;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface EventData {
  ver: number;
  name: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface DataPoint {
  ns?: string;
  name: string;
  kind?: number; // 0 = Measurement, 1 = Aggregation
  value: number;
  count?: number;
  min?: number;
  max?: number;
  stdDev?: number;
}

export interface MetricData {
  ver: number;
  metrics: DataPoint[];
  properties?: Record<string, string>;
}

export interface AvailabilityData {
  ver: number;
  id: string;
  name: string;
  duration: string;
  success: boolean;
  runLocation?: string;
  message?: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface PageviewData {
  ver: number;
  id?: string;
  name: string;
  url?: string;
  duration?: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

export interface PageviewPerformanceData {
  ver: number;
  name: string;
  url?: string;
  duration?: string;
  perfTotal?: string;
  networkConnect?: string;
  sentRequest?: string;
  receivedResponse?: string;
  domProcessing?: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

// --- Envelope ---

export type TelemetryBaseData =
  | RequestData
  | RemoteDependencyData
  | ExceptionData
  | MessageData
  | EventData
  | MetricData
  | AvailabilityData
  | PageviewData
  | PageviewPerformanceData;

export type BaseType =
  | 'RequestData'
  | 'RemoteDependencyData'
  | 'ExceptionData'
  | 'MessageData'
  | 'EventData'
  | 'MetricData'
  | 'AvailabilityData'
  | 'PageviewData'
  | 'PageviewPerformanceData';

export interface TelemetryData {
  baseType: BaseType;
  baseData: TelemetryBaseData;
}

export interface Envelope {
  ver?: number;
  name: string;
  time: string;
  sampleRate?: number;
  seq?: string;
  iKey?: string;
  flags?: number;
  tags?: Record<string, string>;
  data: TelemetryData;
}

// --- Formatting ---

const TIMESPAN_RE = /^(-)?(?:(\d+)[.:])?(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/;

/**
 * Renders a duration the way a human reads it. Application Insights SDKs send
 * either a .NET TimeSpan ("00:00:02.5000000", optionally "d.hh:mm:ss") or a raw
 * millisecond count, both of which are unreadable at a glance in a live list.
 * Anything unrecognised is passed through untouched.
 */
export function formatDuration(raw: string | number | undefined | null): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  let ms: number;
  if (typeof raw === 'number') {
    ms = raw;
  } else {
    const m = TIMESPAN_RE.exec(raw.trim());
    if (!m) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      ms = n;
    } else {
      const [, sign, days, hours, minutes, seconds] = m;
      ms =
        ((Number(days ?? 0) * 24 + Number(hours)) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000;
      if (sign) ms = -ms;
    }
  }

  if (!Number.isFinite(ms)) return String(raw);

  const abs = Math.abs(ms);
  const sign = ms < 0 ? '-' : '';
  if (abs < 1) return `${sign}${abs.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} ms`;
  if (abs < 1000) return `${sign}${Math.round(abs)} ms`;
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(abs < 10_000 ? 2 : 1)} s`;
  if (abs < 3_600_000) {
    const mins = Math.floor(abs / 60_000);
    return `${sign}${mins}m ${Math.round((abs % 60_000) / 1000)}s`;
  }
  const hrs = Math.floor(abs / 3_600_000);
  return `${sign}${hrs}h ${Math.round((abs % 3_600_000) / 60_000)}m`;
}

// Column keys whose values are durations and should be humanised for display.
const DURATION_KEYS = new Set(['baseData.duration', 'baseData.perfTotal']);

// --- Display types ---

export type TelemetryType =
  | 'Request'
  | 'Dependency'
  | 'Exception'
  | 'Trace'
  | 'Event'
  | 'Metric'
  | 'Availability'
  | 'PageView'
  | 'PageViewPerf'
  | 'Unknown';

export interface TelemetryItem {
  id: number;
  timestamp: string;
  type: TelemetryType;
  envelope: Envelope;
  summary: string;
}

// Runtime guard: telemetry arrives from arbitrary HTTP clients, so an envelope is
// only trustworthy once it has been shape-checked. Anything that fails here is
// rejected at ingest rather than stored as an item the UI cannot render.
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  if (e.name !== undefined && typeof e.name !== 'string') return false;
  if (e.time !== undefined && typeof e.time !== 'string') return false;
  if (e.tags !== undefined && (typeof e.tags !== 'object' || e.tags === null)) return false;
  if (e.data !== undefined && (typeof e.data !== 'object' || e.data === null)) return false;
  // An envelope carrying neither a name nor a data payload is not telemetry.
  return typeof e.name === 'string' || typeof e.data === 'object';
}

// Map from envelope name/baseType to our display type
export function resolveType(envelope: Envelope): TelemetryType {
  const bt = envelope.data?.baseType;
  if (bt) {
    switch (bt) {
      case 'RequestData': return 'Request';
      case 'RemoteDependencyData': return 'Dependency';
      case 'ExceptionData': return 'Exception';
      case 'MessageData': return 'Trace';
      case 'EventData': return 'Event';
      case 'MetricData': return 'Metric';
      case 'AvailabilityData': return 'Availability';
      case 'PageviewData': return 'PageView';
      case 'PageviewPerformanceData': return 'PageViewPerf';
    }
  }
  // Fallback: derive from envelope name
  const name = envelope.name?.toLowerCase() ?? '';
  if (name.includes('request')) return 'Request';
  if (name.includes('remotedependency') || name.includes('dependency')) return 'Dependency';
  if (name.includes('exception')) return 'Exception';
  if (name.includes('message')) return 'Trace';
  if (name.includes('pageviewperformance')) return 'PageViewPerf';
  if (name.includes('pageview')) return 'PageView';
  if (name.includes('event')) return 'Event';
  if (name.includes('metric')) return 'Metric';
  if (name.includes('availability')) return 'Availability';
  return 'Unknown';
}

export function buildSummary(type: TelemetryType, envelope: Envelope): string {
  const bd = envelope.data?.baseData;
  if (!bd) return envelope.name ?? 'Unknown';

  switch (type) {
    case 'Request': {
      const d = bd as RequestData;
      return `${d.name || d.url || 'Request'} → ${d.responseCode} (${formatDuration(d.duration)})`;
    }
    case 'Dependency': {
      const d = bd as RemoteDependencyData;
      return `${d.type || 'Dep'}: ${d.name || d.target || 'Dependency'} → ${d.resultCode || '?'} (${formatDuration(d.duration)})`;
    }
    case 'Exception': {
      const d = bd as ExceptionData;
      const ex = d.exceptions?.[0];
      return ex ? `${ex.typeName}: ${ex.message}` : 'Exception';
    }
    case 'Trace': {
      const d = bd as MessageData;
      return d.message || 'Trace';
    }
    case 'Event': {
      const d = bd as EventData;
      return d.name || 'Event';
    }
    case 'Metric': {
      const d = bd as MetricData;
      const m = d.metrics?.[0];
      return m ? `${m.name} = ${m.value}` : 'Metric';
    }
    case 'Availability': {
      const d = bd as AvailabilityData;
      return `${d.name}: ${d.success ? 'Pass' : 'Fail'} (${formatDuration(d.duration)})`;
    }
    case 'PageView': {
      const d = bd as PageviewData;
      return `${d.name || d.url || 'PageView'}${d.duration ? ` (${formatDuration(d.duration)})` : ''}`;
    }
    case 'PageViewPerf': {
      const d = bd as PageviewPerformanceData;
      return `${d.name || d.url || 'PageViewPerf'}${d.duration ? ` (${formatDuration(d.duration)})` : ''}`;
    }
    default:
      return envelope.name ?? 'Unknown';
  }
}

// --- Dynamic Column Definitions ---

export interface ColumnDef {
  key: string;       // unique key like "baseData.duration" or "tags.ai.operation.id"
  label: string;     // display label
  category: 'baseData' | 'tags' | 'properties' | 'measurements';
}

export function extractColumnValue(item: TelemetryItem, col: ColumnDef): string | undefined {
  const bd = item.envelope.data?.baseData;
  switch (col.category) {
    case 'baseData': {
      const field = col.key.replace('baseData.', '');
      if (!bd) return undefined;
      const val = (bd as unknown as Record<string, unknown>)[field];
      if (val === undefined || val === null) return undefined;
      if (DURATION_KEYS.has(col.key) && (typeof val === 'string' || typeof val === 'number')) {
        return formatDuration(val);
      }
      return String(val);
    }
    case 'tags': {
      const tag = col.key.replace('tags.', '');
      return item.envelope.tags?.[tag];
    }
    case 'properties': {
      const prop = col.key.replace('properties.', '');
      if (bd && 'properties' in bd) {
        return (bd as { properties?: Record<string, string> }).properties?.[prop];
      }
      return undefined;
    }
    case 'measurements': {
      const m = col.key.replace('measurements.', '');
      if (bd && 'measurements' in bd) {
        const val = (bd as { measurements?: Record<string, number> }).measurements?.[m];
        return val !== undefined ? String(val) : undefined;
      }
      return undefined;
    }
  }
}


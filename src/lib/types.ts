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
  if (!bd) return envelope.name;

  switch (type) {
    case 'Request': {
      const d = bd as RequestData;
      return `${d.name || d.url || 'Request'} → ${d.responseCode} (${d.duration})`;
    }
    case 'Dependency': {
      const d = bd as RemoteDependencyData;
      return `${d.type || 'Dep'}: ${d.name || d.target || 'Dependency'} → ${d.resultCode || '?'} (${d.duration})`;
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
      return `${d.name}: ${d.success ? 'Pass' : 'Fail'} (${d.duration})`;
    }
    case 'PageView': {
      const d = bd as PageviewData;
      return `${d.name || d.url || 'PageView'}${d.duration ? ` (${d.duration})` : ''}`;
    }
    case 'PageViewPerf': {
      const d = bd as PageviewPerformanceData;
      return `${d.name || d.url || 'PageViewPerf'}${d.duration ? ` (${d.duration})` : ''}`;
    }
    default:
      return envelope.name;
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
      return val !== undefined && val !== null ? String(val) : undefined;
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


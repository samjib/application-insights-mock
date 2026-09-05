import type { TelemetryType } from './types';

/**
 * A view is a saved way of looking at the buffer: which telemetry types are in
 * scope, and which columns are worth seeing for them. The generic feed has to
 * show columns that suit everything, which means it suits nothing in particular;
 * these give each kind of telemetry the columns you would actually pick.
 */
export interface TelemetryView {
  id: string;
  label: string;
  /** Types in scope, or null for everything. */
  types: TelemetryType[] | null;
  /** Column keys shown unless the user has chosen otherwise for this view. */
  defaultColumns: string[];
  description: string;
}

export const INSIGHTS_VIEW_ID = 'insights';

export const VIEWS: TelemetryView[] = [
  {
    id: INSIGHTS_VIEW_ID,
    label: 'Overview',
    types: null,
    defaultColumns: [],
    description: 'Aggregate view of everything captured',
  },
  {
    id: 'all',
    label: 'Live feed',
    types: null,
    defaultColumns: [],
    description: 'Every telemetry item, newest first',
  },
  {
    id: 'requests',
    label: 'Requests',
    types: ['Request'],
    defaultColumns: ['baseData.responseCode', 'baseData.duration', 'baseData.url'],
    description: 'Incoming HTTP requests',
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    types: ['Dependency'],
    defaultColumns: [
      'baseData.type',
      'baseData.target',
      'baseData.resultCode',
      'baseData.duration',
    ],
    description: 'Outbound calls — HTTP, SQL, queues',
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    types: ['Exception'],
    defaultColumns: ['baseData.problemId', 'properties.CategoryName'],
    description: 'Unhandled and tracked exceptions',
  },
  {
    id: 'traces',
    label: 'Traces',
    types: ['Trace'],
    defaultColumns: ['baseData.severityLevel', 'properties.CategoryName'],
    description: 'ILogger output',
  },
  {
    id: 'events',
    label: 'Events',
    types: ['Event'],
    defaultColumns: ['baseData.name'],
    description: 'Custom events',
  },
];

export const DEFAULT_VIEW_ID = 'all';

const BY_ID = new Map(VIEWS.map((v) => [v.id, v]));

export function getView(id: string | undefined | null): TelemetryView {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_VIEW_ID)!;
}

export function isValidViewId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * Columns for a view: the user's choice for that view if they have made one,
 * otherwise the view's own defaults. An explicit empty list is a choice — it
 * means "no extra columns" — so it is distinct from having chosen nothing.
 */
export function columnsForView(
  view: TelemetryView,
  overrides: Record<string, string[]>,
): string[] {
  const chosen = overrides[view.id];
  return chosen ?? view.defaultColumns;
}

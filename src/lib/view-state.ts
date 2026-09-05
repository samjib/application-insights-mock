import { DEFAULT_VIEW_ID, isValidViewId } from './views';
import type { TelemetryType } from './types';

/**
 * The parts of the dashboard view worth keeping: what you are looking at, not
 * what is happening. Held in the URL so a view can be shared or bookmarked, and
 * mirrored to localStorage so a plain reload restores what you had.
 *
 * Transient state (pause, selection, connection) is deliberately excluded —
 * reloading into a paused dashboard is a bug, not a feature.
 */
export interface ViewState {
  /** Which page is open — see `views.ts`. */
  view: string;
  search: string;
  hiddenTypes: TelemetryType[];
  categoryFilters: string[];
  operationFilter: string | null;
  /**
   * Column choices per view. A view absent from this map falls back to its own
   * defaults, so a user who never touches the picker gets columns suited to
   * whatever they are looking at.
   */
  columnsByView: Record<string, string[]>;
  /** Fraction of the width given to the list when the detail pane is open. */
  splitFraction: number | null;
  /** Hides the per-view summary strip above the list. */
  summaryCollapsed: boolean;
}

const STORAGE_KEY = 'mock-ai-view';

// Two earlier shapes for the column selection, both read once so an existing
// choice survives the upgrade rather than silently resetting.
const LEGACY_COLUMNS_KEY = 'mock-ai-columns';

export const MIN_SPLIT = 0.25;
export const MAX_SPLIT = 0.8;
export const DEFAULT_SPLIT = 0.6;

export const EMPTY_VIEW: ViewState = {
  view: DEFAULT_VIEW_ID,
  search: '',
  hiddenTypes: [],
  categoryFilters: [],
  operationFilter: null,
  columnsByView: {},
  splitFraction: null,
  summaryCollapsed: false,
};

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function clampSplit(fraction: number): number {
  if (!Number.isFinite(fraction)) return DEFAULT_SPLIT;
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, fraction));
}

// --- URL ---

export function toSearchParams(state: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== DEFAULT_VIEW_ID) params.set('view', state.view);
  if (state.search.trim()) params.set('q', state.search);
  if (state.hiddenTypes.length) params.set('hide', state.hiddenTypes.join(','));
  if (state.categoryFilters.length) params.set('cat', state.categoryFilters.join(','));
  if (state.operationFilter) params.set('op', state.operationFilter);
  // Only the active view's columns travel in the URL — that is what the link shows.
  const active = state.columnsByView[state.view];
  if (active) params.set('cols', active.join(','));
  if (state.splitFraction !== null) params.set('split', state.splitFraction.toFixed(3));
  if (state.summaryCollapsed) params.set('summary', '0');
  return params;
}

function fromSearchParams(params: URLSearchParams): Partial<ViewState> {
  const out: Partial<ViewState> = {};
  const view = params.get('view');
  if (isValidViewId(view)) out.view = view;
  if (params.has('q')) out.search = params.get('q') ?? '';
  if (params.has('hide')) out.hiddenTypes = splitList(params.get('hide')) as TelemetryType[];
  if (params.has('cat')) out.categoryFilters = splitList(params.get('cat'));
  if (params.has('op')) out.operationFilter = params.get('op') || null;
  if (params.has('cols')) {
    out.columnsByView = { [out.view ?? DEFAULT_VIEW_ID]: splitList(params.get('cols')) };
  }
  if (params.has('split')) {
    const n = Number(params.get('split'));
    if (Number.isFinite(n)) out.splitFraction = clampSplit(n);
  }
  if (params.has('summary')) out.summaryCollapsed = params.get('summary') === '0';
  return out;
}

// --- localStorage ---

function columnMap(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = stringArray(v);
  }
  return out;
}

function fromStorage(): Partial<ViewState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_COLUMNS_KEY);
      if (!legacy) return {};
      const parsed: unknown = JSON.parse(legacy);
      const keys = stringArray(parsed);
      return keys.length ? { columnsByView: { [DEFAULT_VIEW_ID]: keys } } : {};
    }

    const parsed: unknown = JSON.parse(raw);
    // Anything that is not the expected shape is discarded rather than trusted;
    // a malformed value here used to crash every load.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }

    const v = parsed as Record<string, unknown>;
    // `columnKeys` is the previous single-list shape; it becomes the live feed's.
    const legacyKeys = stringArray(v.columnKeys);
    const columnsByView = columnMap(v.columnsByView);
    if (legacyKeys.length && !(DEFAULT_VIEW_ID in columnsByView)) {
      columnsByView[DEFAULT_VIEW_ID] = legacyKeys;
    }

    return {
      view: isValidViewId(v.view) ? v.view : DEFAULT_VIEW_ID,
      search: typeof v.search === 'string' ? v.search : '',
      hiddenTypes: stringArray(v.hiddenTypes) as TelemetryType[],
      categoryFilters: stringArray(v.categoryFilters),
      operationFilter: typeof v.operationFilter === 'string' ? v.operationFilter : null,
      columnsByView,
      splitFraction: typeof v.splitFraction === 'number' ? clampSplit(v.splitFraction) : null,
      summaryCollapsed: v.summaryCollapsed === true,
    };
  } catch {
    return {};
  }
}

export function saveViewState(view: ViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    /* storage full or blocked — the URL still carries the view */
  }
}

/**
 * Reads the view to start from. A URL that carries any view parameter wins
 * outright, so a shared link is never quietly merged with local history.
 */
export function loadViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const fromUrl = fromSearchParams(params);
  const source = Object.keys(fromUrl).length > 0 ? fromUrl : fromStorage();
  return { ...EMPTY_VIEW, ...source };
}

/** Rewrites the address bar in place — the view is not navigation history. */
export function syncUrl(view: ViewState): void {
  const params = toSearchParams(view);
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', next);
  }
}

import { TelemetryType } from './types';

/**
 * The parts of the dashboard view worth keeping: what you are looking at, not
 * what is happening. Held in the URL so a view can be shared or bookmarked, and
 * mirrored to localStorage so a plain reload restores what you had.
 *
 * Transient state (pause, selection, connection) is deliberately excluded —
 * reloading into a paused dashboard is a bug, not a feature.
 */
export interface ViewState {
  search: string;
  hiddenTypes: TelemetryType[];
  categoryFilters: string[];
  operationFilter: string | null;
  columnKeys: string[];
  /** Fraction of the width given to the list when the detail pane is open. */
  splitFraction: number | null;
}

const STORAGE_KEY = 'mock-ai-view';

// Superseded by `columnKeys` on ViewState; still read once so an existing
// column selection survives the upgrade.
const LEGACY_COLUMNS_KEY = 'mock-ai-columns';

export const MIN_SPLIT = 0.25;
export const MAX_SPLIT = 0.8;
export const DEFAULT_SPLIT = 0.6;

export const EMPTY_VIEW: ViewState = {
  search: '',
  hiddenTypes: [],
  categoryFilters: [],
  operationFilter: null,
  columnKeys: [],
  splitFraction: null,
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

export function toSearchParams(view: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (view.search.trim()) params.set('q', view.search);
  if (view.hiddenTypes.length) params.set('hide', view.hiddenTypes.join(','));
  if (view.categoryFilters.length) params.set('cat', view.categoryFilters.join(','));
  if (view.operationFilter) params.set('op', view.operationFilter);
  if (view.columnKeys.length) params.set('cols', view.columnKeys.join(','));
  if (view.splitFraction !== null) params.set('split', view.splitFraction.toFixed(3));
  return params;
}

function fromSearchParams(params: URLSearchParams): Partial<ViewState> {
  const out: Partial<ViewState> = {};
  if (params.has('q')) out.search = params.get('q') ?? '';
  if (params.has('hide')) out.hiddenTypes = splitList(params.get('hide')) as TelemetryType[];
  if (params.has('cat')) out.categoryFilters = splitList(params.get('cat'));
  if (params.has('op')) out.operationFilter = params.get('op') || null;
  if (params.has('cols')) out.columnKeys = splitList(params.get('cols'));
  if (params.has('split')) {
    const n = Number(params.get('split'));
    if (Number.isFinite(n)) out.splitFraction = clampSplit(n);
  }
  return out;
}

// --- localStorage ---

function fromStorage(): Partial<ViewState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_COLUMNS_KEY);
      if (!legacy) return {};
      const parsed: unknown = JSON.parse(legacy);
      return { columnKeys: stringArray(parsed) };
    }

    const parsed: unknown = JSON.parse(raw);
    // Anything that is not the expected shape is discarded rather than trusted;
    // a malformed value here used to crash every load.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }

    const v = parsed as Record<string, unknown>;
    const out: Partial<ViewState> = {
      search: typeof v.search === 'string' ? v.search : '',
      hiddenTypes: stringArray(v.hiddenTypes) as TelemetryType[],
      categoryFilters: stringArray(v.categoryFilters),
      operationFilter: typeof v.operationFilter === 'string' ? v.operationFilter : null,
      columnKeys: stringArray(v.columnKeys),
      splitFraction: typeof v.splitFraction === 'number' ? clampSplit(v.splitFraction) : null,
    };
    return out;
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

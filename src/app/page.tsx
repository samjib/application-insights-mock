'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ColumnDef, TelemetryItem, TelemetryType } from '@/lib/types';
import { matchesQuery, parseQuery, warmSearchIndex } from '@/lib/search';
import {
  DEFAULT_SPLIT,
  EMPTY_VIEW,
  ViewState,
  loadViewState,
  saveViewState,
  syncUrl,
} from '@/lib/view-state';
import { columnsForView, getView } from '@/lib/views';
import FilterBar from '@/components/FilterBar';
import SummaryPanel from '@/components/SummaryPanel';
import ViewTabs from '@/components/ViewTabs';
import Splitter from '@/components/Splitter';
import TelemetryList from '@/components/TelemetryList';
import TelemetryDetail from '@/components/TelemetryDetail';

const PLACEHOLDER_IKEY = '00000000-0000-0000-0000-000000000000';
const FALLBACK_ORIGIN = 'http://localhost:3000';

// Items pulled on first paint. The full ring buffer can be tens of megabytes of
// JSON, which blocks the main thread long enough to be felt; older items are
// still reachable through the API.
const SNAPSHOT_LIMIT = 2000;

// Incoming SSE batches are buffered for this long before being committed, so a
// chatty app produces a few renders per second instead of one per HTTP request.
const FLUSH_INTERVAL_MS = 120;

// The view is written to the URL and localStorage this long after it settles,
// so typing and dragging the splitter do not each cost a write.
const VIEW_SYNC_DEBOUNCE_MS = 250;

function buildConnectionString(origin: string): string {
  return `InstrumentationKey=${PLACEHOLDER_IKEY};IngestionEndpoint=${origin}`;
}

const noopSubscribe = () => () => {};
const getOriginClient = () => window.location.origin;
const getOriginServer = () => FALLBACK_ORIGIN;

type Batch = { items?: TelemetryItem[]; newColumns?: ColumnDef[] };

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** Compiles one matcher per filter, rather than one per filter per item per render. */
function buildCategoryMatchers(filters: string[]): ((category: string) => boolean)[] {
  return filters.map((filter) => {
    if (filter.includes('*')) {
      const re = new RegExp('^' + escapeRegex(filter).replace(/\\\*/g, '.*') + '(\\..+)?$', 'i');
      return (category: string) => re.test(category);
    }
    const prefix = filter + '.';
    return (category: string) => category === filter || category.startsWith(prefix);
  });
}

function getCategory(item: TelemetryItem): string | undefined {
  return (item.envelope.data?.baseData as { properties?: Record<string, string> } | undefined)
    ?.properties?.CategoryName;
}

function mergeColumns(existing: ColumnDef[], fresh: ColumnDef[]): ColumnDef[] {
  if (!fresh.length) return existing;
  const seen = new Set(existing.map((c) => c.key));
  const merged = existing.slice();
  for (const c of fresh) {
    if (!seen.has(c.key)) {
      seen.add(c.key);
      merged.push(c);
    }
  }
  return merged;
}

function downloadNdjson(items: TelemetryItem[]) {
  const lines = items.map((i) => JSON.stringify(i.envelope)).join('\n');
  const blob = new Blob([lines], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `telemetry-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [items, setItems] = useState<TelemetryItem[]>([]);
  const [pendingItems, setPendingItems] = useState<TelemetryItem[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [selectedItem, setSelectedItem] = useState<TelemetryItem | null>(null);
  const [connected, setConnected] = useState(false);
  const [dropMetrics, setDropMetrics] = useState(true);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  // Everything worth sharing or restoring lives in one object, so it round-trips
  // through the URL and localStorage as a unit.
  const [view, setView] = useState<ViewState>(EMPTY_VIEW);
  const [hydrated, setHydrated] = useState(false);

  const paneRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Restore after mount: reading the URL or localStorage during render would make
  // the first client render disagree with the server-rendered HTML.
  useEffect(() => {
    const restored = loadViewState(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(restored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      syncUrl(view);
      saveViewState(view);
    }, VIEW_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [view, hydrated]);

  // SSR-safe origin: avoids hydration mismatch; handles reverse proxies automatically
  const origin = useSyncExternalStore(noopSubscribe, getOriginClient, getOriginServer);
  const connectionString = buildConnectionString(origin);

  // Typing stays responsive while the (expensive) filtered list catches up.
  const deferredSearch = useDeferredValue(view.search);
  const query = useMemo(() => parseQuery(deferredSearch), [deferredSearch]);

  const hiddenTypes = useMemo(() => new Set(view.hiddenTypes), [view.hiddenTypes]);
  const splitFraction = view.splitFraction ?? DEFAULT_SPLIT;

  const activeView = getView(view.view);
  const selectedColumnKeys = useMemo(
    () => columnsForView(activeView, view.columnsByView),
    [activeView, view.columnsByView],
  );
  const viewTypes = useMemo(
    () => (activeView.types ? new Set(activeView.types) : null),
    [activeView],
  );

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let firstOpen = true;
    let itemBuffer: TelemetryItem[] = [];
    let columnBuffer: ColumnDef[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    function flush() {
      flushTimer = null;
      const freshItems = itemBuffer;
      const freshColumns = columnBuffer;
      itemBuffer = [];
      columnBuffer = [];

      if (freshColumns.length) setColumns((prev) => mergeColumns(prev, freshColumns));
      if (!freshItems.length) return;
      if (pausedRef.current) setPendingItems((prev) => [...prev, ...freshItems]);
      else setItems((prev) => [...prev, ...freshItems]);
    }

    function scheduleFlush() {
      if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
    }

    async function refreshState() {
      try {
        const res = await fetch(`/api/events?limit=${SNAPSHOT_LIMIT}`);
        const d = await res.json();
        if (Array.isArray(d.items)) setItems(d.items);
        if (Array.isArray(d.columns)) setColumns(d.columns);
      } catch {
        /* noop */
      }
    }

    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.dropMetrics === 'boolean') setDropMetrics(d.dropMetrics);
      })
      .catch(() => {});

    refreshState();

    const es = new EventSource('/api/events/stream');
    es.onopen = () => {
      setConnected(true);
      // reconnect — resync to pick up items missed during disconnect
      if (!firstOpen && !pausedRef.current) refreshState();
      firstOpen = false;
    };

    es.onmessage = (event) => {
      try {
        const batch = JSON.parse(event.data) as Batch;
        if (batch.newColumns?.length) columnBuffer.push(...batch.newColumns);
        if (batch.items?.length) itemBuffer.push(...batch.items);
        if (batch.newColumns?.length || batch.items?.length) scheduleFlush();
      } catch {
        // Ignore parse errors (keepalive comments)
      }
    };

    es.addEventListener('clear', () => {
      itemBuffer = [];
      columnBuffer = [];
      setItems([]);
      setPendingItems([]);
      setColumns([]);
      setSelectedItem(null);
    });

    es.onerror = () => setConnected(false);

    return () => {
      if (flushTimer !== null) clearTimeout(flushTimer);
      es.close();
    };
  }, []);

  const handleClear = useCallback(() => {
    fetch('/api/events', { method: 'DELETE' }).catch(() => {});
    setItems([]);
    setPendingItems([]);
    setColumns([]);
    setSelectedItem(null);
  }, []);

  const handleSelect = useCallback((item: TelemetryItem) => {
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  }, []);

  const handleCopyConnectionString = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  }, [connectionString]);

  const handleResume = useCallback(() => {
    setItems((prev) => [...prev, ...pendingItems]);
    setPendingItems([]);
    setPaused(false);
  }, [pendingItems]);

  const handleTogglePause = useCallback(() => {
    if (paused) handleResume();
    else setPaused(true);
  }, [paused, handleResume]);

  const setSearch = useCallback((search: string) => {
    setView((v) => ({ ...v, search }));
  }, []);

  const handleTypeToggle = useCallback((type: TelemetryType) => {
    setView((v) => ({
      ...v,
      hiddenTypes: v.hiddenTypes.includes(type)
        ? v.hiddenTypes.filter((t) => t !== type)
        : [...v.hiddenTypes, type],
    }));
  }, []);

  const handleCategoryFiltersChange = useCallback((categoryFilters: string[]) => {
    setView((v) => ({ ...v, categoryFilters }));
  }, []);

  const handleColumnToggle = useCallback(
    (key: string) => {
      setView((v) => {
        const current = columnsForView(activeView, v.columnsByView);
        const next = current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key];
        return { ...v, columnsByView: { ...v.columnsByView, [activeView.id]: next } };
      });
    },
    [activeView],
  );

  /** Forget this view's column choice, falling back to its defaults. */
  const handleColumnReset = useCallback(() => {
    setView((v) => {
      const next = { ...v.columnsByView };
      delete next[activeView.id];
      return { ...v, columnsByView: next };
    });
  }, [activeView]);

  const handleClearFilters = useCallback(() => {
    setView((v) => ({
      ...v,
      search: '',
      categoryFilters: [],
      operationFilter: null,
      hiddenTypes: [],
    }));
  }, []);

  const handleViewChange = useCallback((id: string) => {
    setView((v) => ({ ...v, view: id }));
    setSelectedItem(null);
  }, []);

  /** Scope the list to something clicked in the summary above it. */
  const handleDrillDown = useCallback((query: string) => {
    setView((v) => ({ ...v, search: query, operationFilter: null }));
    setSelectedItem(null);
  }, []);

  const handleToggleSummary = useCallback(() => {
    setView((v) => ({ ...v, summaryCollapsed: !v.summaryCollapsed }));
  }, []);

  const handleFilterByOperation = useCallback((opId: string) => {
    setView((v) => ({ ...v, operationFilter: opId }));
    setSelectedItem(null);
  }, []);

  const handleClearOperationFilter = useCallback(() => {
    setView((v) => ({ ...v, operationFilter: null }));
  }, []);

  const handleSplitChange = useCallback((splitFraction: number) => {
    setView((v) => ({ ...v, splitFraction }));
  }, []);

  const categoryMatchers = useMemo(
    () => buildCategoryMatchers(view.categoryFilters),
    [view.categoryFilters],
  );

  // Items matching the search and filters but not scoped to a telemetry type —
  // the overview summarises across types, so it starts from this set.
  const scopedItems = useMemo(() => {
    let result = items;

    if (view.operationFilter) {
      result = result.filter((i) => i.envelope.tags?.['ai.operation.id'] === view.operationFilter);
    }

    if (categoryMatchers.length > 0) {
      result = result.filter((i) => {
        const cat = getCategory(i);
        if (!cat) return false;
        return categoryMatchers.some((match) => match(cat));
      });
    }

    if (query.terms.length > 0) {
      result = result.filter((i) => matchesQuery(i, query));
    }

    return result;
  }, [items, query, categoryMatchers, view.operationFilter]);

  const filteredItems = useMemo(() => {
    let result = scopedItems;

    if (viewTypes) {
      result = result.filter((i) => viewTypes.has(i.type));
    } else if (hiddenTypes.size > 0) {
      result = result.filter((i) => !hiddenTypes.has(i.type));
    }

    return result.slice().sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
      return b.id - a.id;
    });
  }, [scopedItems, hiddenTypes, viewTypes]);

  const availableCategories = useMemo(() => {
    const leafCats = new Set<string>();
    for (const item of items) {
      const cat = getCategory(item);
      if (cat) leafCats.add(cat);
    }
    const allPrefixes = new Set<string>();
    for (const cat of leafCats) {
      allPrefixes.add(cat);
      const parts = cat.split('.');
      for (let i = 1; i < parts.length; i++) {
        allPrefixes.add(parts.slice(0, i).join('.'));
      }
    }
    return Array.from(allPrefixes).sort();
  }, [items]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  // Order follows the view's column list, not discovery order, so the defaults
  // read the way they were written.
  const filtersActive =
    view.search.trim().length > 0 ||
    view.categoryFilters.length > 0 ||
    view.operationFilter !== null ||
    view.hiddenTypes.length > 0;

  const extraColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return selectedColumnKeys
      .map((key) => byKey.get(key))
      .filter((c): c is ColumnDef => c !== undefined);
  }, [columns, selectedColumnKeys]);

  // Index newly arrived items while the browser is idle, so the first search of a
  // session does not stall on the whole buffer at once.
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    let handle: number | undefined;

    const schedule: typeof window.requestIdleCallback =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : (cb) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 8 }), 200);
    const cancel: typeof window.cancelIdleCallback =
      typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback.bind(window)
        : (id) => window.clearTimeout(id);

    function step(deadline: IdleDeadline) {
      if (cancelled) return;
      const done = warmSearchIndex(items, Math.max(4, deadline.timeRemaining()));
      if (!done) handle = schedule(step);
    }

    handle = schedule(step);
    return () => {
      cancelled = true;
      if (handle !== undefined) cancel(handle);
    };
  }, [items]);

  // Keyboard handling reads through a ref so the window listener is registered
  // once, rather than being torn down and rebuilt on every incoming batch.
  const latest = useRef({ filteredItems, selectedItem, view, handleTogglePause });
  useEffect(() => {
    latest.current = { filteredItems, selectedItem, view, handleTogglePause };
  });

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
    }

    function navigate(delta: number) {
      const { filteredItems: list, selectedItem: selected } = latest.current;
      if (list.length === 0) return;
      const currentIdx = selected ? list.findIndex((i) => i.id === selected.id) : -1;
      const nextIdx = currentIdx === -1
        ? (delta > 0 ? 0 : list.length - 1)
        : Math.min(list.length - 1, Math.max(0, currentIdx + delta));
      setSelectedItem(list[nextIdx]);
    }

    function handleKey(e: KeyboardEvent) {
      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const { selectedItem: selected, view: current } = latest.current;
      switch (e.key) {
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'Escape':
          if (selected) setSelectedItem(null);
          else if (current.operationFilter) handleClearOperationFilter();
          else if (current.search) setSearch('');
          break;
        case ' ':
          e.preventDefault();
          latest.current.handleTogglePause();
          break;
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          navigate(1);
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          navigate(-1);
          break;
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleClearOperationFilter, setSearch]);

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Application Insights Mock
          </span>
        </div>
        <button
          onClick={handleCopyConnectionString}
          className="group inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          title={connectionString}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
            />
          </svg>
          <span>{copied ? 'Copied!' : 'Copy connection string'}</span>
        </button>
      </div>

      <ViewTabs
        activeId={activeView.id}
        onSelect={handleViewChange}
        typeCounts={typeCounts}
        totalCount={items.length}
      />

      <FilterBar
        searchInputRef={searchInputRef}
        hiddenTypes={hiddenTypes}
        onTypeToggle={handleTypeToggle}
        searchQuery={view.search}
        onSearchChange={setSearch}
        categoryFilters={view.categoryFilters}
        onCategoryFiltersChange={handleCategoryFiltersChange}
        availableCategories={availableCategories}
        operationFilter={view.operationFilter}
        onClearOperationFilter={handleClearOperationFilter}
        itemCount={filteredItems.length}
        totalItemCount={items.length}
        pendingCount={pendingItems.length}
        paused={paused}
        onTogglePause={handleTogglePause}
        onClear={handleClear}
        onExport={() => downloadNdjson(filteredItems)}
        dropMetrics={dropMetrics}
        onDropMetricsToggle={() => {
          const next = !dropMetrics;
          setDropMetrics(next);
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dropMetrics: next }),
          }).catch(() => {});
        }}
        typeCounts={typeCounts}
        availableColumns={columns}
        selectedColumnKeys={selectedColumnKeys}
        onColumnToggle={handleColumnToggle}
        onColumnReset={handleColumnReset}
        columnsAreDefault={view.columnsByView[activeView.id] === undefined}
        // The view already scopes the types, so its own filter would only confuse.
        showTypeFilter={activeView.types === null}
        showColumnPicker
      />

      <SummaryPanel
        items={filteredItems}
        view={activeView}
        collapsed={view.summaryCollapsed}
        onToggle={handleToggleSummary}
        onDrillDown={handleDrillDown}
      />

      <div ref={paneRef} className="flex-1 flex min-h-0">
        <div
          className="flex flex-col min-h-0"
          style={{ width: selectedItem ? `${splitFraction * 100}%` : '100%' }}
        >
          <TelemetryList
            items={filteredItems}
            selectedItem={selectedItem}
            onSelect={handleSelect}
            extraColumns={extraColumns}
            highlightTerms={query.highlights}
            onCopyConnectionString={handleCopyConnectionString}
            copied={copied}
            connectionString={connectionString}
            hasCapturedItems={items.length > 0}
            filtersActive={filtersActive}
            onClearFilters={handleClearFilters}
          />
        </div>

        {selectedItem && (
          <>
            <Splitter containerRef={paneRef} fraction={splitFraction} onChange={handleSplitChange} />
            <div className="flex-1 min-w-0">
              <TelemetryDetail
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onSearch={setSearch}
                onFilterByOperation={handleFilterByOperation}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
import FilterBar from '@/components/FilterBar';
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

function buildConnectionString(origin: string): string {
  return `InstrumentationKey=${PLACEHOLDER_IKEY};IngestionEndpoint=${origin}`;
}

const noopSubscribe = () => () => {};
const getOriginClient = () => window.location.origin;
const getOriginServer = () => FALLBACK_ORIGIN;

const COLUMNS_STORAGE_KEY = 'mock-ai-columns';

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

function readStoredColumnKeys(): string[] {
  try {
    const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    // A malformed value used to crash every load, and reloading could not clear
    // it. Anything that is not a list of keys is discarded.
    if (!Array.isArray(parsed) || !parsed.every((k) => typeof k === 'string')) {
      localStorage.removeItem(COLUMNS_STORAGE_KEY);
      return [];
    }
    return parsed as string[];
  } catch {
    return [];
  }
}

function getCategory(item: TelemetryItem): string | undefined {
  return (item.envelope.data?.baseData as { properties?: Record<string, string> } | undefined)
    ?.properties?.CategoryName;
}

// Lowercased searchable text per item, built once and held only as long as the
// item itself. Rebuilding this on every keystroke was the bulk of search cost.
const haystackCache = new WeakMap<TelemetryItem, string>();

function searchHaystack(item: TelemetryItem): string {
  const cached = haystackCache.get(item);
  if (cached !== undefined) return cached;

  const parts: string[] = [item.summary ?? '', item.type];
  const tags = item.envelope.tags;
  if (tags) {
    for (const v of Object.values(tags)) if (typeof v === 'string') parts.push(v);
  }
  const props = (item.envelope.data?.baseData as { properties?: Record<string, string> } | undefined)
    ?.properties;
  if (props) {
    for (const v of Object.values(props)) if (typeof v === 'string') parts.push(v);
  }

  // Joined with a separator that cannot occur in telemetry text, so a query
  // never matches by spanning the boundary between two fields.
  const value = parts.join('\u0000').toLowerCase();
  haystackCache.set(item, value);
  return value;
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
  const [hiddenTypes, setHiddenTypes] = useState<Set<TelemetryType>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [operationFilter, setOperationFilter] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [dropMetrics, setDropMetrics] = useState(true);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>([]);

  // Read after mount: reading localStorage during render made the first client
  // render differ from the server-rendered HTML. A one-shot hydration read is
  // the intended pattern here, so the setState-in-effect rule does not apply.
  useEffect(() => {
    const stored = readStoredColumnKeys();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored.length) setSelectedColumnKeys(stored);
  }, []);

  // SSR-safe origin: avoids hydration mismatch; handles reverse proxies automatically
  const origin = useSyncExternalStore(noopSubscribe, getOriginClient, getOriginServer);
  const connectionString = buildConnectionString(origin);

  // Typing stays responsive while the (expensive) filtered list catches up.
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const pausedRef = useRef(paused);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const handleColumnToggle = useCallback((key: string) => {
    setSelectedColumnKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const handleFilterByOperation = useCallback((opId: string) => {
    setOperationFilter(opId);
    setSelectedItem(null);
  }, []);

  const categoryMatchers = useMemo(() => buildCategoryMatchers(categoryFilters), [categoryFilters]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (hiddenTypes.size > 0) {
      result = result.filter((i) => !hiddenTypes.has(i.type));
    }

    if (operationFilter) {
      result = result.filter((i) => i.envelope.tags?.['ai.operation.id'] === operationFilter);
    }

    if (categoryMatchers.length > 0) {
      result = result.filter((i) => {
        const cat = getCategory(i);
        if (!cat) return false;
        return categoryMatchers.some((match) => match(cat));
      });
    }

    const q = deferredSearchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((i) => searchHaystack(i).includes(q));
    }

    return result.slice().sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
      return b.id - a.id;
    });
  }, [items, hiddenTypes, deferredSearchQuery, categoryMatchers, operationFilter]);

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

  const extraColumns = useMemo(
    () => columns.filter((c) => selectedColumnKeys.includes(c.key)),
    [columns, selectedColumnKeys],
  );

  // Keyboard handling reads through a ref so the window listener is registered
  // once, rather than being torn down and rebuilt on every incoming batch.
  const latest = useRef({ filteredItems, selectedItem, operationFilter, searchQuery, handleTogglePause });
  useEffect(() => {
    latest.current = { filteredItems, selectedItem, operationFilter, searchQuery, handleTogglePause };
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
      const { selectedItem: selected, operationFilter: opFilter, searchQuery: query } = latest.current;
      switch (e.key) {
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'Escape':
          if (selected) setSelectedItem(null);
          else if (opFilter) setOperationFilter(null);
          else if (query) setSearchQuery('');
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
  }, []);

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

      <FilterBar
        searchInputRef={searchInputRef}
        hiddenTypes={hiddenTypes}
        onTypeToggle={(type) =>
          setHiddenTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
          })
        }
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilters={categoryFilters}
        onCategoryFiltersChange={setCategoryFilters}
        availableCategories={availableCategories}
        operationFilter={operationFilter}
        onClearOperationFilter={() => setOperationFilter(null)}
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
      />

      <div className="flex-1 flex min-h-0">
        <div className={`flex flex-col min-h-0 ${selectedItem ? 'w-1/2' : 'w-full'}`}>
          <TelemetryList
            items={filteredItems}
            selectedItem={selectedItem}
            onSelect={handleSelect}
            extraColumns={extraColumns}
            onCopyConnectionString={handleCopyConnectionString}
            copied={copied}
            connectionString={connectionString}
          />
        </div>

        {selectedItem && (
          <div className="w-1/2">
            <TelemetryDetail
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
              onSearch={setSearchQuery}
              onFilterByOperation={handleFilterByOperation}
            />
          </div>
        )}
      </div>
    </div>
  );
}

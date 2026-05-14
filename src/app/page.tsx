'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ColumnDef, TelemetryItem, TelemetryType } from '@/lib/types';
import FilterBar from '@/components/FilterBar';
import TelemetryList from '@/components/TelemetryList';
import TelemetryDetail from '@/components/TelemetryDetail';

const PLACEHOLDER_IKEY = '00000000-0000-0000-0000-000000000000';
const FALLBACK_ORIGIN = 'http://localhost:3000';

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

function matchesCategoryFilter(filter: string, category: string): boolean {
  if (filter.includes('*')) {
    const pattern = '^' + escapeRegex(filter).replace(/\\\*/g, '.*') + '(\\..+)?$';
    return new RegExp(pattern, 'i').test(category);
  }
  return category === filter || category.startsWith(filter + '.');
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
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(COLUMNS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  // SSR-safe origin: avoids hydration mismatch; handles reverse proxies automatically
  const origin = useSyncExternalStore(noopSubscribe, getOriginClient, getOriginServer);
  const connectionString = buildConnectionString(origin);

  const pausedRef = useRef(paused);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let firstOpen = true;

    async function refreshState() {
      try {
        const res = await fetch('/api/events');
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
        if (batch.newColumns?.length) {
          setColumns((prev) => mergeColumns(prev, batch.newColumns!));
        }
        if (batch.items?.length) {
          const fresh = batch.items;
          if (pausedRef.current) {
            setPendingItems((prev) => [...prev, ...fresh]);
          } else {
            setItems((prev) => [...prev, ...fresh]);
          }
        }
      } catch {
        // Ignore parse errors (keepalive comments)
      }
    };

    es.addEventListener('clear', () => {
      setItems([]);
      setPendingItems([]);
      setColumns([]);
      setSelectedItem(null);
    });

    es.onerror = () => setConnected(false);

    return () => es.close();
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

  const filteredItems = useMemo(() => {
    let result = items;

    if (hiddenTypes.size > 0) {
      result = result.filter((i) => !hiddenTypes.has(i.type));
    }

    if (operationFilter) {
      result = result.filter((i) => i.envelope.tags?.['ai.operation.id'] === operationFilter);
    }

    if (categoryFilters.length > 0) {
      result = result.filter((i) => {
        const cat = (i.envelope.data?.baseData as { properties?: Record<string, string> } | undefined)
          ?.properties?.CategoryName;
        if (!cat) return false;
        return categoryFilters.some((f) => matchesCategoryFilter(f, cat));
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) => {
        if (i.summary.toLowerCase().includes(q)) return true;
        if (i.type.toLowerCase().includes(q)) return true;
        const tags = i.envelope.tags;
        if (tags) {
          for (const v of Object.values(tags)) {
            if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
          }
        }
        const props = (i.envelope.data?.baseData as { properties?: Record<string, string> } | undefined)?.properties;
        if (props) {
          for (const v of Object.values(props)) {
            if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    return result.slice().sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? 1 : -1;
      return b.id - a.id;
    });
  }, [items, hiddenTypes, searchQuery, categoryFilters, operationFilter]);

  const availableCategories = useMemo(() => {
    const leafCats = new Set<string>();
    for (const item of items) {
      const props = (item.envelope.data?.baseData as { properties?: Record<string, string> } | undefined)?.properties;
      if (props?.CategoryName) leafCats.add(props.CategoryName);
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
      if (filteredItems.length === 0) return;
      const currentIdx = selectedItem
        ? filteredItems.findIndex((i) => i.id === selectedItem.id)
        : -1;
      const nextIdx = currentIdx === -1
        ? (delta > 0 ? 0 : filteredItems.length - 1)
        : Math.min(filteredItems.length - 1, Math.max(0, currentIdx + delta));
      setSelectedItem(filteredItems[nextIdx]);
    }

    function handleKey(e: KeyboardEvent) {
      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      switch (e.key) {
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'Escape':
          if (selectedItem) setSelectedItem(null);
          else if (operationFilter) setOperationFilter(null);
          else if (searchQuery) setSearchQuery('');
          break;
        case ' ':
          e.preventDefault();
          handleTogglePause();
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
  }, [filteredItems, selectedItem, operationFilter, searchQuery, handleTogglePause]);

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
        <div className={`flex flex-col min-h-0 ${selectedItem ? 'w-1/2' : 'w-full'} transition-all`}>
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

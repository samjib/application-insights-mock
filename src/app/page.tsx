'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { TelemetryItem, TelemetryType, discoverColumns } from '@/lib/types';
import FilterBar from '@/components/FilterBar';
import TelemetryList from '@/components/TelemetryList';
import TelemetryDetail from '@/components/TelemetryDetail';

export default function Home() {
  const [items, setItems] = useState<TelemetryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<TelemetryItem | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<TelemetryType>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [dropMetrics, setDropMetrics] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('mock-ai-columns');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  const CONNECTION_STRING = 'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://localhost:3000';

  const handleCopyConnectionString = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CONNECTION_STRING);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  // Load initial items, settings, and connect to SSE
  useEffect(() => {
    // Fetch server-side dropMetrics setting
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.dropMetrics === 'boolean') setDropMetrics(data.dropMetrics);
      })
      .catch(console.error);

    // Fetch existing items
    fetch('/api/events')
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setItems(data.items);
      })
      .catch(console.error);

    // Connect to SSE
    const es = new EventSource('/api/events/stream');
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data) as TelemetryItem;
        setItems((prev) => [...prev, item]);
      } catch {
        // Ignore parse errors (e.g. keepalive comments)
      }
    };

    es.addEventListener('clear', () => {
      setItems([]);
      setSelectedItem(null);
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, []);

  const handleClear = useCallback(() => {
    fetch('/api/events', { method: 'DELETE' }).catch(console.error);
    setItems([]);
    setSelectedItem(null);
  }, []);

  const handleSelect = useCallback((item: TelemetryItem) => {
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  }, []);

  const handleFilter = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items;

    if (hiddenTypes.size > 0) {
      result = result.filter((i) => !hiddenTypes.has(i.type));
    }

    if (categoryFilters.length > 0) {
      const matchers = categoryFilters.map((f) => {
        if (f.includes('*')) {
          const pattern = f.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          return new RegExp('^' + pattern + '(\\..+)?$', 'i');
        }
        return null;
      });
      result = result.filter((i) => {
        const cat = ((i.envelope.data?.baseData as unknown as Record<string, unknown>)?.properties as Record<string, string> | undefined)?.CategoryName;
        if (!cat) return false;
        return categoryFilters.some((f, idx) => {
          if (matchers[idx]) return matchers[idx].test(cat);
          return cat === f || cat.startsWith(f + '.');
        });
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
        const props = i.envelope.data?.baseData?.properties;
        if (props) {
          for (const v of Object.values(props)) {
            if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    return result.slice().reverse();
  }, [items, hiddenTypes, searchQuery, categoryFilters]);

  const availableCategories = useMemo(() => {
    const leafCats = new Set<string>();
    for (const item of items) {
      const props = ((item.envelope.data?.baseData as unknown as Record<string, unknown>)?.properties as Record<string, string> | undefined);
      if (props?.CategoryName) leafCats.add(props.CategoryName);
    }
    // Build hierarchical set: for "Microsoft.AspNetCore.Routing", also add "Microsoft" and "Microsoft.AspNetCore"
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

  const availableColumns = useMemo(() => discoverColumns(items), [items]);

  const extraColumns = useMemo(
    () => availableColumns.filter((c) => selectedColumnKeys.includes(c.key)),
    [availableColumns, selectedColumnKeys],
  );

  const handleColumnToggle = useCallback((key: string) => {
    setSelectedColumnKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem('mock-ai-columns', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Application Insights Mock
          </span>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>
        <button
          onClick={handleCopyConnectionString}
          className="text-xs text-gray-400 dark:text-gray-500 font-mono hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 px-2 py-1 rounded transition-colors cursor-pointer"
          title="Click to copy connection string"
        >
          {copied ? 'Copied!' : 'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://localhost:3000'}
        </button>
      </div>

      {/* Filter bar */}
      <FilterBar
        hiddenTypes={hiddenTypes}
        onTypeToggle={(type) => setHiddenTypes((prev) => {
          const next = new Set(prev);
          if (next.has(type)) next.delete(type); else next.add(type);
          return next;
        })}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilters={categoryFilters}
        onCategoryFiltersChange={setCategoryFilters}
        availableCategories={availableCategories}
        itemCount={filteredItems.length}
        totalItemCount={items.length}
        onClear={handleClear}
        dropMetrics={dropMetrics}
        onDropMetricsToggle={() => {
          const next = !dropMetrics;
          setDropMetrics(next);
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dropMetrics: next }),
          }).catch(console.error);
        }}
        typeCounts={typeCounts}
        availableColumns={availableColumns}
        selectedColumnKeys={selectedColumnKeys}
        onColumnToggle={handleColumnToggle}
      />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Telemetry list */}
        <div className={`flex flex-col min-h-0 ${selectedItem ? 'w-1/2' : 'w-full'} transition-all`}>
          <TelemetryList
            items={filteredItems}
            selectedItem={selectedItem}
            onSelect={handleSelect}
            extraColumns={extraColumns}
          />
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <div className="w-1/2">
            <TelemetryDetail item={selectedItem} onClose={() => setSelectedItem(null)} onFilter={handleFilter} />
          </div>
        )}
      </div>
    </div>
  );
}

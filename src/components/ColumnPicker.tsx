'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ColumnDef } from '@/lib/types';

interface ColumnPickerProps {
  availableColumns: ColumnDef[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  baseData: 'Base Data',
  tags: 'Tags',
  properties: 'Properties',
  measurements: 'Measurements',
};

const CATEGORY_ORDER: ColumnDef['category'][] = ['baseData', 'tags', 'properties', 'measurements'];

export default function ColumnPicker({ availableColumns, selectedKeys, onToggle }: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableColumns;
    const q = search.toLowerCase();
    return availableColumns.filter((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q));
  }, [availableColumns, search]);

  const grouped = new Map<string, ColumnDef[]>();
  for (const col of filtered) {
    const list = grouped.get(col.category) ?? [];
    list.push(col);
    grouped.set(col.category, list);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
        className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
          selectedKeys.length > 0
            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        Columns {selectedKeys.length > 0 ? `(${selectedKeys.length})` : ''}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg flex flex-col max-h-96">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search columns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <div className="p-3 text-xs text-gray-400">
                {availableColumns.length === 0
                  ? 'No columns discovered yet. Receive some telemetry first.'
                  : 'No columns match your search.'}
              </div>
            )}
            {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((cat) => (
              <div key={cat}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                  {CATEGORY_LABELS[cat]}
                </div>
                {grouped.get(cat)!.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(col.key)}
                      onChange={() => onToggle(col.key)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{col.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

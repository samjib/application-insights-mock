'use client';

import { useState, useRef, useEffect } from 'react';
import { TelemetryType, ColumnDef } from '@/lib/types';
import ColumnPicker from './ColumnPicker';

const TYPES: TelemetryType[] = ['Request', 'Dependency', 'Trace', 'Exception', 'Event', 'Metric', 'Availability', 'PageView', 'PageViewPerf'];

const TYPE_COLORS: Record<string, { on: string; off: string; badge: string }> = {
  Request:      { on: 'bg-emerald-600 text-white', off: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-500' },
  Dependency:   { on: 'bg-blue-600 text-white',    off: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400', badge: 'bg-blue-500' },
  Trace:        { on: 'bg-yellow-600 text-white',   off: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400', badge: 'bg-yellow-500' },
  Exception:    { on: 'bg-red-600 text-white',      off: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400', badge: 'bg-red-500' },
  Event:        { on: 'bg-purple-600 text-white',   off: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400', badge: 'bg-purple-500' },
  Metric:       { on: 'bg-orange-600 text-white',   off: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400', badge: 'bg-orange-500' },
  Availability: { on: 'bg-teal-600 text-white',     off: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400', badge: 'bg-teal-500' },
  PageView:     { on: 'bg-cyan-600 text-white',     off: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400', badge: 'bg-cyan-500' },
  PageViewPerf: { on: 'bg-pink-600 text-white',     off: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-400', badge: 'bg-pink-500' },
};

interface FilterBarProps {
  hiddenTypes: Set<TelemetryType>;
  onTypeToggle: (type: TelemetryType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilters: string[];
  onCategoryFiltersChange: (filters: string[]) => void;
  availableCategories: string[];
  itemCount: number;
  totalItemCount: number;
  onClear: () => void;
  dropMetrics: boolean;
  onDropMetricsToggle: () => void;
  typeCounts: Map<string, number>;
  availableColumns: ColumnDef[];
  selectedColumnKeys: string[];
  onColumnToggle: (key: string) => void;
}

export default function FilterBar({
  hiddenTypes,
  onTypeToggle,
  searchQuery,
  onSearchChange,
  categoryFilters,
  onCategoryFiltersChange,
  availableCategories,
  itemCount,
  totalItemCount,
  onClear,
  dropMetrics,
  onDropMetricsToggle,
  typeCounts,
  availableColumns,
  selectedColumnKeys,
  onColumnToggle,
}: FilterBarProps) {
  const [catInput, setCatInput] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showTypesDropdown, setShowTypesDropdown] = useState(false);
  const catWrapperRef = useRef<HTMLDivElement>(null);
  const typesDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catWrapperRef.current && !catWrapperRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
      }
      if (typesDropdownRef.current && !typesDropdownRef.current.contains(e.target as Node)) {
        setShowTypesDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredSuggestions = catInput.trim()
    ? availableCategories.filter(
        (c) => c.toLowerCase().includes(catInput.toLowerCase()) && !categoryFilters.includes(c),
      )
    : availableCategories.filter((c) => !categoryFilters.includes(c));

  function addCategoryFilter(value: string) {
    const trimmed = value.trim();
    if (!trimmed || categoryFilters.includes(trimmed)) return;
    onCategoryFiltersChange([...categoryFilters, trimmed]);
    setCatInput('');
  }

  function removeCategoryFilter(value: string) {
    onCategoryFiltersChange(categoryFilters.filter((f) => f !== value));
  }
  const hiddenCount = hiddenTypes.size;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 flex items-center gap-2">
      {/* Types dropdown */}
      <div ref={typesDropdownRef} className="relative shrink-0">
        <button
          onClick={() => setShowTypesDropdown((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
            hiddenCount > 0
              ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          <span>Types</span>
          {hiddenCount > 0 && (
            <span className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-[10px] px-1 rounded-full">
              {TYPES.length - hiddenCount}/{TYPES.length}
            </span>
          )}
          <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {showTypesDropdown && (
          <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {TYPES.map((t) => {
              const active = !hiddenTypes.has(t);
              const colors = TYPE_COLORS[t];
              return (
                <label
                  key={t}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer select-none"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors.badge} ${active ? 'opacity-100' : 'opacity-30'}`} />
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onTypeToggle(t)}
                    className="sr-only"
                  />
                  <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border shrink-0 ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                    {active && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                  <span className={`text-xs font-medium ${active ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>{t}</span>
                  {(typeCounts.get(t) ?? 0) > 0 && (
                    <span className={`ml-auto text-[10px] tabular-nums ${active ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'}`}>
                      {typeCounts.get(t)}
                    </span>
                  )}
                </label>
              );
            })}
            <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1 px-3 pb-1 flex gap-2">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { TYPES.forEach((t) => { if (hiddenTypes.has(t)) onTypeToggle(t); }); }}
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >All</button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { TYPES.forEach((t) => { if (!hiddenTypes.has(t)) onTypeToggle(t); }); }}
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >None</button>
            </div>
          </div>
        )}
      </div>

      {/* Search input — constrained */}
      <div className="relative flex-1 min-w-0 max-w-sm">
        <input
          type="text"
          placeholder="Search telemetry..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-3 py-1.5 pr-8 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-600 dark:hover:text-gray-200 text-sm leading-none cursor-pointer transition-colors"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Category filter — constrained */}
      <div ref={catWrapperRef} className="relative shrink-0 min-w-40 max-w-xs">
        <div className="flex flex-wrap items-center gap-1 px-2 py-1 pr-7 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-blue-500 max-h-16 overflow-y-auto">
          {categoryFilters.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs whitespace-nowrap"
            >
              {f}
              <button
                onClick={() => removeCategoryFilter(f)}
                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 leading-none cursor-pointer ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            placeholder={categoryFilters.length === 0 ? 'Filter categories...' : ''}
            value={catInput}
            onChange={(e) => {
              setCatInput(e.target.value);
              setShowCatDropdown(true);
            }}
            onFocus={() => setShowCatDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCategoryFilter(catInput);
              } else if (e.key === 'Backspace' && !catInput && categoryFilters.length > 0) {
                removeCategoryFilter(categoryFilters[categoryFilters.length - 1]);
              }
            }}
            className="flex-1 min-w-16 py-0.5 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none text-sm"
          />
        </div>
        {categoryFilters.length > 0 && (
          <button
            onClick={() => onCategoryFiltersChange([])}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-600 dark:hover:text-gray-200 text-sm leading-none cursor-pointer transition-colors"
            title="Clear all category filters"
          >
            ×
          </button>
        )}
        {showCatDropdown && filteredSuggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full min-w-48 max-h-64 overflow-y-auto rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg right-0">
            {filteredSuggestions.map((cat) => {
              const depth = cat.split('.').length - 1;
              return (
                <button
                  key={cat}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addCategoryFilter(cat)}
                  className="w-full text-left px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer"
                >
                  <span style={{ paddingLeft: `${depth * 0.75}rem` }}>
                    {depth > 0 ? cat.split('.').pop() : cat}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
          {itemCount !== totalItemCount ? `${itemCount} / ${totalItemCount}` : itemCount} items
        </span>

        <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Discard incoming Metric telemetry (reduces noise)">
          <input
            type="checkbox"
            checked={dropMetrics}
            onChange={onDropMetricsToggle}
            className="rounded text-orange-600"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">Drop Metrics</span>
        </label>

        <ColumnPicker
          availableColumns={availableColumns}
          selectedKeys={selectedColumnKeys}
          onToggle={onColumnToggle}
        />

        <button
          onClick={onClear}
          className="px-3 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition-colors cursor-pointer"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}

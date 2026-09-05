'use client';

import { RefObject, useEffect, useRef, useState } from 'react';
import { ColumnDef, TelemetryType } from '@/lib/types';
import ColumnPicker from './ColumnPicker';

const TYPES: TelemetryType[] = [
  'Request',
  'Dependency',
  'Trace',
  'Exception',
  'Event',
  'Metric',
  'Availability',
  'PageView',
  'PageViewPerf',
];

const SEARCH_SYNTAX_ROWS: [string, string][] = [
  ['orders 500', 'both terms must match'],
  ['"order placed"', 'quoted phrase'],
  ['-healthcheck', 'exclude matches'],
  ['url:/api/orders', 'scope to one field'],
  ['-code:200', 'scope and exclude'],
  ['Tenant:acme', 'any property or tag key'],
];

const SEARCH_SYNTAX_HINT = [
  'Search across every field of an item.',
  '',
  ...SEARCH_SYNTAX_ROWS.map(([example, meaning]) => `${example}  —  ${meaning}`),
].join('\n');

const TYPE_BADGE: Record<string, string> = {
  Request: 'bg-emerald-500',
  Dependency: 'bg-blue-500',
  Trace: 'bg-yellow-500',
  Exception: 'bg-red-500',
  Event: 'bg-purple-500',
  Metric: 'bg-orange-500',
  Availability: 'bg-teal-500',
  PageView: 'bg-cyan-500',
  PageViewPerf: 'bg-pink-500',
};

interface FilterBarProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  hiddenTypes: Set<TelemetryType>;
  onTypeToggle: (type: TelemetryType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilters: string[];
  onCategoryFiltersChange: (filters: string[]) => void;
  availableCategories: string[];
  operationFilter: string | null;
  onClearOperationFilter: () => void;
  itemCount: number;
  totalItemCount: number;
  pendingCount: number;
  paused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  onExport: () => void;
  dropMetrics: boolean;
  onDropMetricsToggle: () => void;
  typeCounts: Map<string, number>;
  availableColumns: ColumnDef[];
  selectedColumnKeys: string[];
  onColumnToggle: (key: string) => void;
  onColumnReset: () => void;
  /** False once the user has picked columns for the current view. */
  columnsAreDefault: boolean;
  /** Hidden when the active view already scopes the telemetry types. */
  showTypeFilter: boolean;
  showColumnPicker: boolean;
  itemNoun?: string;
}

export default function FilterBar({
  searchInputRef,
  hiddenTypes,
  onTypeToggle,
  searchQuery,
  onSearchChange,
  categoryFilters,
  onCategoryFiltersChange,
  availableCategories,
  operationFilter,
  onClearOperationFilter,
  itemCount,
  totalItemCount,
  pendingCount,
  paused,
  onTogglePause,
  onClear,
  onExport,
  dropMetrics,
  onDropMetricsToggle,
  typeCounts,
  availableColumns,
  selectedColumnKeys,
  onColumnToggle,
  onColumnReset,
  columnsAreDefault,
  showTypeFilter,
  showColumnPicker,
  itemNoun,
}: FilterBarProps) {
  const [catInput, setCatInput] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [showTypesDropdown, setShowTypesDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const catWrapperRef = useRef<HTMLDivElement>(null);
  const typesDropdownRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catWrapperRef.current && !catWrapperRef.current.contains(e.target as Node)) {
        setShowCatDropdown(false);
      }
      if (typesDropdownRef.current && !typesDropdownRef.current.contains(e.target as Node)) {
        setShowTypesDropdown(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowCatDropdown(false);
        setShowTypesDropdown(false);
        setShowSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
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
  const visibleTypes = TYPES.length - hiddenCount;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 flex items-center gap-2 flex-wrap">
      <button
        onClick={onTogglePause}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
          paused
            ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
        }`}
        title={paused ? 'Resume live updates (Space)' : 'Pause live updates (Space)'}
      >
        {paused ? (
          <>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Resume</span>
            {pendingCount > 0 && (
              <span className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-[10px] px-1 rounded-full tabular-nums">
                +{pendingCount}
              </span>
            )}
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <span>Pause</span>
          </>
        )}
      </button>

      {showTypeFilter && (
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
            <span className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-[10px] px-1 rounded-full tabular-nums">
              {visibleTypes}/{TYPES.length}
            </span>
          )}
          <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showTypesDropdown && (
          <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
            {TYPES.map((t) => {
              const active = !hiddenTypes.has(t);
              return (
                <label
                  key={t}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer select-none"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_BADGE[t]} ${active ? 'opacity-100' : 'opacity-30'}`}
                  />
                  <input type="checkbox" checked={active} onChange={() => onTypeToggle(t)} className="sr-only" />
                  <span
                    className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border shrink-0 ${
                      active ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {active && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      active ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {t}
                  </span>
                  {(typeCounts.get(t) ?? 0) > 0 && (
                    <span
                      className={`ml-auto text-[10px] tabular-nums ${
                        active ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'
                      }`}
                    >
                      {typeCounts.get(t)}
                    </span>
                  )}
                </label>
              );
            })}
            <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1 px-3 pb-1 flex gap-2">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => TYPES.forEach((t) => hiddenTypes.has(t) && onTypeToggle(t))}
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                All
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => TYPES.forEach((t) => !hiddenTypes.has(t) && onTypeToggle(t))}
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                None
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="relative flex-1 min-w-0 max-w-sm">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search…  ( / to focus · -exclude · field:value )"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          title={SEARCH_SYNTAX_HINT}
          spellCheck={false}
          autoComplete="off"
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
            placeholder={categoryFilters.length === 0 ? 'Filter categories…' : ''}
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

      {/* Operation filter chip */}
      {operationFilter && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-mono shrink-0">
          op: {operationFilter.slice(0, 8)}…
          <button
            onClick={onClearOperationFilter}
            className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 leading-none cursor-pointer ml-0.5"
            title="Clear operation filter"
          >
            ×
          </button>
        </span>
      )}

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <span
          className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap"
          title={`${itemCount.toLocaleString()} shown of ${totalItemCount.toLocaleString()} captured`}
        >
          {itemCount === totalItemCount
            ? itemCount.toLocaleString()
            : `${itemCount.toLocaleString()} of ${totalItemCount.toLocaleString()}`}
          {itemNoun && itemCount === 1 ? ` ${itemNoun}` : ''}
        </span>

        {showColumnPicker && (
          <ColumnPicker
            availableColumns={availableColumns}
            selectedKeys={selectedColumnKeys}
            onToggle={onColumnToggle}
            onReset={onColumnReset}
            isDefault={columnsAreDefault}
          />
        )}

        <button
          onClick={onExport}
          disabled={itemCount === 0}
          className="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download filtered telemetry as NDJSON"
        >
          Export
        </button>

        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-1">
              <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dropMetrics}
                  onChange={onDropMetricsToggle}
                  className="rounded text-orange-600"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">Drop Metric telemetry</span>
              </label>
              <div className="px-3 py-1.5 text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                Discards Metric items on ingest — reduces noise. Configured by env <code>DROP_METRICS_DEFAULT</code>.
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1 px-3 py-1 text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                Shortcuts: <kbd>/</kbd> search · <kbd>j</kbd>/<kbd>k</kbd> nav · <kbd>Space</kbd> pause · <kbd>Esc</kbd> close
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1.5 px-3 pb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                  Search syntax
                </div>
                <dl className="space-y-0.5 text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                  {SEARCH_SYNTAX_ROWS.map(([example, meaning]) => (
                    <div key={example} className="flex gap-1.5">
                      <dt className="shrink-0 font-mono text-gray-500 dark:text-gray-400 w-28 truncate">
                        {example}
                      </dt>
                      <dd className="flex-1">{meaning}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                  Fields: <span className="font-mono">url data target code name message stack
                  problem duration severity success category op role type</span>, plus any custom
                  property or tag key.
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClear}
          className="px-3 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition-colors cursor-pointer"
          title="Clear all telemetry items"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}

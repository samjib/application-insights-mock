'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ColumnDef, TelemetryItem } from '@/lib/types';
import TelemetryItemRow, { ROW_HEIGHT } from './TelemetryItemRow';

// Rows rendered above and below the viewport, so a fast scroll does not expose
// blank space before the next frame lands.
const OVERSCAN = 10;

// Width the summary column is never allowed to drop below — it is the column
// that actually matters, so everything else yields to it first.
const MIN_SUMMARY_WIDTH = 160;

// Roughly what each trailing column asks for, used to decide when the operation
// column has to go. A fixed threshold was wrong: four extra columns need 1,062px
// before the summary gets a single pixel, so the grid overflowed its container
// at ordinary laptop widths.
const COLUMN_BUDGET = { base: 300, operation: 208, extra: 136 };

interface TelemetryListProps {
  items: TelemetryItem[];
  selectedItem: TelemetryItem | null;
  onSelect: (item: TelemetryItem) => void;
  extraColumns: ColumnDef[];
  highlightTerms: string[];
  connectionString: string;
  copied: boolean;
  onCopyConnectionString: () => void;
  /** True when the buffer holds anything at all, filters aside. */
  hasCapturedItems: boolean;
  /** True when a search, category, type or operation filter is narrowing the list. */
  filtersActive: boolean;
  onClearFilters: () => void;
}

/**
 * Header and rows share these tracks, so every column lines up regardless of
 * which optional cells a given item happens to populate.
 *
 * Every optional track is `minmax(0, …)`: it takes its preferred width when
 * there is room and compresses when there is not, so the grid can never grow
 * wider than its container. Only the type, severity and marker columns are
 * fixed, and together they come to under 100px.
 */
function buildGridTemplate(extraColumns: ColumnDef[], compact: boolean, showOperation: boolean): string {
  return [
    compact ? 'minmax(0, 5.5rem)' : 'minmax(0, 10rem)', // time
    '3rem', // type badge
    '1.75rem', // severity
    '1rem', // success marker
    `minmax(${MIN_SUMMARY_WIDTH}px, 1fr)`, // summary
    ...extraColumns.map(() => (compact ? 'minmax(0, 5rem)' : 'minmax(0, 8rem)')),
    ...(showOperation ? ['minmax(0, 12.5rem)'] : []), // operation name
  ].join(' ');
}

export default function TelemetryList({
  items,
  selectedItem,
  onSelect,
  extraColumns,
  highlightTerms,
  connectionString,
  copied,
  onCopyConnectionString,
  hasCapturedItems,
  filtersActive,
  onClearFilters,
}: TelemetryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  // Items that arrived above the current scroll position since the user last
  // looked at the top of the list.
  const [unseenCount, setUnseenCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Track the head of the list so prepended items can be compensated for.
  const prevHeadRef = useRef<{ id: number; length: number } | null>(null);

  // Width 0 means "not measured yet"; assume roomy so the first paint is not compact.
  const measured = viewportWidth > 0;
  const budget = COLUMN_BUDGET.base + extraColumns.length * COLUMN_BUDGET.extra + MIN_SUMMARY_WIDTH;
  // The operation column is the first to go, then the time column tightens.
  const showOperation = !measured || viewportWidth >= budget + COLUMN_BUDGET.operation;
  const compact = measured && viewportWidth < budget;
  const gridTemplate = buildGridTemplate(extraColumns, compact, showOperation);
  // The scroll container is unmounted while the empty state is showing, so the
  // listeners below have to be re-attached when items first arrive.
  const isEmpty = items.length === 0;

  const readScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      // Coalesce scroll events to one state update per frame.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        readScroll();
      });
    }

    el.addEventListener('scroll', onScroll, { passive: true });

    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
      setViewportWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    setViewportWidth(el.clientWidth);

    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [readScroll, isEmpty]);

  // Virtualising the list removes the browser's own scroll anchoring, so keep the
  // row under the cursor put when newer items are inserted above it.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevHeadRef.current;
    prevHeadRef.current = items.length ? { id: items[0].id, length: items.length } : null;

    if (!el || !prev || !items.length) return;
    if (items[0].id === prev.id) return; // nothing new at the head
    if (el.scrollTop === 0) return; // following the tail — let new rows push in

    const idx = items.findIndex((i) => i.id === prev.id);
    const inserted = idx === -1 ? items.length - prev.length : idx;
    if (inserted > 0) {
      el.scrollTop += inserted * ROW_HEIGHT;
      setScrollTop(el.scrollTop);
      setUnseenCount((n) => n + inserted);
    }
  }, [items]);

  // Back at the top means everything above has been seen.
  useEffect(() => {
    if (scrollTop === 0 && unseenCount !== 0) setUnseenCount(0);
  }, [scrollTop, unseenCount]);

  // Keep the selected row on screen when it is moved by the keyboard.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedItem || !viewportHeight) return;
    const idx = items.findIndex((i) => i.id === selectedItem.id);
    if (idx === -1) return;

    const top = idx * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < el.scrollTop) {
      el.scrollTop = top;
      setScrollTop(top);
    } else if (bottom > el.scrollTop + viewportHeight) {
      el.scrollTop = bottom - viewportHeight;
      setScrollTop(el.scrollTop);
    }
    // `items` is intentionally excluded: re-running on every batch would fight
    // the scroll-anchoring effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem, viewportHeight]);

  const scrollToTop = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'smooth' });
    setUnseenCount(0);
  };

  // Nothing to show has two very different causes, and conflating them sent people
  // to check their connection string when the real answer was an active filter.
  if (items.length === 0 && hasCapturedItems) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 p-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-lg font-medium text-gray-600 dark:text-gray-300">
            Nothing matches here
          </div>
          <div className="text-sm mt-2 text-gray-500 dark:text-gray-400">
            {filtersActive
              ? 'Telemetry is being captured, but nothing in this view matches the current filters.'
              : 'Telemetry is being captured, but none of it is of this kind yet.'}
          </div>
          {filtersActive && (
            <button
              onClick={onClearFilters}
              className="mt-3 px-3 py-1.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-3">📊</div>
          <div className="text-lg font-medium text-gray-600 dark:text-gray-300">No telemetry yet</div>
          <div className="text-sm mt-3 text-gray-500 dark:text-gray-400">
            Point your app&apos;s Application Insights connection string at this server:
          </div>
          <code className="block mt-3 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-[11px] text-left text-gray-700 dark:text-gray-300 break-all font-mono">
            {connectionString}
          </code>
          <button
            onClick={onCopyConnectionString}
            className="mt-3 px-3 py-1.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy connection string'}
          </button>
        </div>
      </div>
    );
  }

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil((viewportHeight || 600) / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(items.length, startIdx + visibleCount);
  const visible = items.slice(startIdx, endIdx);

  return (
    <div className="flex-1 flex flex-col relative min-h-0">
      <div
        style={{ gridTemplateColumns: gridTemplate }}
        className="grid items-center gap-2 px-3 py-1 border-b border-gray-200 dark:border-gray-700 border-l-2 border-l-transparent bg-gray-50 dark:bg-gray-900 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0"
      >
        <span>Time</span>
        <span className="text-center">Type</span>
        <span>Sev</span>
        <span />
        <span>Summary</span>
        {extraColumns.map((col) => (
          <span key={col.key} className="truncate font-mono" title={col.key}>
            {col.label}
          </span>
        ))}
        {showOperation && <span className="truncate">Operation</span>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div style={{ height: items.length * ROW_HEIGHT }} className="relative">
          <div style={{ transform: `translateY(${startIdx * ROW_HEIGHT}px)` }}>
            {visible.map((item) => (
              <TelemetryItemRow
                key={item.id}
                item={item}
                isSelected={selectedItem?.id === item.id}
                onClick={onSelect}
                extraColumns={extraColumns}
                gridTemplate={gridTemplate}
                highlightTerms={highlightTerms}
                showOperation={showOperation}
              />
            ))}
          </div>
        </div>
      </div>

      {unseenCount > 0 && (
        <button
          onClick={scrollToTop}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-medium shadow-lg hover:bg-blue-500 transition-colors cursor-pointer tabular-nums"
          title="Jump to the newest telemetry"
        >
          {unseenCount.toLocaleString()} new ↑
        </button>
      )}

      {scrollTop > 200 && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-gray-800/80 dark:bg-gray-200/80 text-white dark:text-gray-900 shadow-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors text-sm font-bold cursor-pointer"
          title="Scroll to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ColumnDef, TelemetryItem } from '@/lib/types';
import TelemetryItemRow, { ROW_HEIGHT } from './TelemetryItemRow';

// Rows rendered above and below the viewport, so a fast scroll does not expose
// blank space before the next frame lands.
const OVERSCAN = 10;

// Below this list width the trailing columns crowd out the summary, which is the
// column that actually matters, so they are dropped instead of squeezed.
const COMPACT_WIDTH = 720;

interface TelemetryListProps {
  items: TelemetryItem[];
  selectedItem: TelemetryItem | null;
  onSelect: (item: TelemetryItem) => void;
  extraColumns: ColumnDef[];
  highlightTerms: string[];
  connectionString: string;
  copied: boolean;
  onCopyConnectionString: () => void;
}

function buildGridTemplate(extraColumns: ColumnDef[], compact: boolean): string {
  // Header and rows share these tracks, so every column lines up regardless of
  // which optional cells a given item happens to populate.
  return [
    compact ? '5.5rem' : '10rem', // time
    '3rem', // type badge
    '1.75rem', // severity
    '1rem', // success marker
    'minmax(0, 1fr)', // summary — never yields its share to a trailing column
    ...extraColumns.map(() => (compact ? '5rem' : '8rem')),
    ...(compact ? [] : ['12.5rem']), // operation name
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
  const compact = viewportWidth > 0 && viewportWidth < COMPACT_WIDTH;
  const gridTemplate = buildGridTemplate(extraColumns, compact);
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
        {!compact && <span className="truncate">Operation</span>}
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
                showOperation={!compact}
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

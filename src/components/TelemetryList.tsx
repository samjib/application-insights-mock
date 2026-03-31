'use client';

import { useRef, useState, useEffect } from 'react';
import { TelemetryItem, ColumnDef } from '@/lib/types';
import TelemetryItemRow from './TelemetryItemRow';

interface TelemetryListProps {
  items: TelemetryItem[];
  selectedItem: TelemetryItem | null;
  onSelect: (item: TelemetryItem) => void;
  extraColumns: ColumnDef[];
}

export default function TelemetryList({ items, selectedItem, onSelect, extraColumns }: TelemetryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (el) setShowScrollTop(el.scrollTop > 200);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-lg font-medium">No telemetry received yet</div>
          <div className="text-sm mt-1">
            Point your app&apos;s connection string to{' '}
            <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
              http://localhost:3000
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col relative min-h-0">
      {/* Column headings */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
        <span className="shrink-0 w-40">Time</span>
        <span className="shrink-0 w-16.25 text-center">Type</span>
        <span className="shrink-0 w-7">Sev</span>
        <span className="shrink-0 w-3.5"></span>
        <span className="flex-1">Summary</span>
        {extraColumns.map((col) => (
          <span key={col.key} className="shrink-0 max-w-32 truncate font-mono">{col.label}</span>
        ))}
        <span className="shrink-0 max-w-50">Operation</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <TelemetryItemRow
            key={item.id}
            item={item}
            isSelected={selectedItem?.id === item.id}
            onClick={onSelect}
            extraColumns={extraColumns}
          />
        ))}
      </div>

      {showScrollTop && (
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

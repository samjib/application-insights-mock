'use client';

import { useEffect, useRef, useState } from 'react';
import { ColumnDef, TelemetryItem } from '@/lib/types';
import TelemetryItemRow from './TelemetryItemRow';

interface TelemetryListProps {
  items: TelemetryItem[];
  selectedItem: TelemetryItem | null;
  onSelect: (item: TelemetryItem) => void;
  extraColumns: ColumnDef[];
  connectionString: string;
  copied: boolean;
  onCopyConnectionString: () => void;
}

export default function TelemetryList({
  items,
  selectedItem,
  onSelect,
  extraColumns,
  connectionString,
  copied,
  onCopyConnectionString,
}: TelemetryListProps) {
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

  useEffect(() => {
    if (!selectedItem) return;
    const el = document.getElementById(`telemetry-row-${selectedItem.id}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedItem]);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <div ref={containerRef} className="flex-1 flex flex-col relative min-h-0">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
        <span className="shrink-0 w-40">Time</span>
        <span className="shrink-0 w-12 text-center">Type</span>
        <span className="shrink-0 w-7">Sev</span>
        <span className="shrink-0 w-3.5"></span>
        <span className="flex-1">Summary</span>
        {extraColumns.map((col) => (
          <span key={col.key} className="shrink-0 max-w-32 truncate font-mono">
            {col.label}
          </span>
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

'use client';

import { TelemetryType } from '@/lib/types';
import { VIEWS } from '@/lib/views';

interface ViewTabsProps {
  activeId: string;
  onSelect: (id: string) => void;
  /** Item counts per telemetry type, for the badge on each tab. */
  typeCounts: Map<string, number>;
  totalCount: number;
}

function countFor(types: TelemetryType[] | null, typeCounts: Map<string, number>, total: number) {
  if (types === null) return total;
  let sum = 0;
  for (const t of types) sum += typeCounts.get(t) ?? 0;
  return sum;
}

export default function ViewTabs({ activeId, onSelect, typeCounts, totalCount }: ViewTabsProps) {
  return (
    <nav
      aria-label="Views"
      className="flex items-stretch gap-0.5 px-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-x-auto"
    >
      {VIEWS.map((view) => {
        const active = view.id === activeId;
        const count = countFor(view.types, typeCounts, totalCount);
        return (
          <button
            key={view.id}
            onClick={() => onSelect(view.id)}
            aria-current={active ? 'page' : undefined}
            title={view.description}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer border-b-2 -mb-px transition-colors ${
              active
                ? 'border-blue-500 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/60'
            }`}
          >
            <span>{view.label}</span>
            {count > 0 && (
              <span
                className={`text-[10px] tabular-nums rounded-full px-1.5 py-0.5 ${
                  active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

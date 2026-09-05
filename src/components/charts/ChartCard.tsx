'use client';

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  /** Rendered value beside the swatch, so identity is never colour-alone. */
  value?: string;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Omitted for a single-series chart — the title already names what is plotted. */
  legend?: LegendEntry[];
  children: React.ReactNode;
  className?: string;
}

/**
 * The frame every chart shares: a title, an optional legend, and the surface the
 * 2px mark spacers are made of. `--chart-surface` lets marks punch through to the
 * card background without hard-coding the colour into each chart.
 */
export default function ChartCard({ title, subtitle, legend, children, className }: ChartCardProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3 ${className ?? ''}`}
      style={{ ['--chart-surface' as string]: 'var(--color-gray-900, #111827)' }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</span>
          )}
        </div>
        {legend && legend.length > 1 && (
          <ul className="flex items-center gap-2.5 flex-wrap">
            {legend.map((entry) => (
              <li key={entry.key} className="flex items-center gap-1 text-[11px]">
                {/* Bars and areas get a rect key; the text stays in a text token. */}
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: entry.color }}
                />
                <span className="text-gray-600 dark:text-gray-400">{entry.label}</span>
                {entry.value && (
                  <span className="text-gray-500 dark:text-gray-500 tabular-nums">{entry.value}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
    </div>
  );
}

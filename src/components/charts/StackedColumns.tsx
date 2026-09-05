'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AXIS_TEXT, GRID, MARK } from '@/lib/chart-theme';

export interface ColumnSeries {
  key: string;
  label: string;
  color: string;
}

export interface ColumnDatum {
  /** Bucket start, epoch ms. */
  from: number;
  /** Values in the same order as `series`, bottom of the stack first. */
  values: number[];
}

interface StackedColumnsProps {
  data: ColumnDatum[];
  series: ColumnSeries[];
  height?: number;
  /** Width of one bucket in ms, for the tooltip's time range. */
  bucketMs: number;
  /** Row of the y axis, e.g. "items". */
  valueLabel: string;
  emptyMessage: string;
}

const PADDING = { top: 8, right: 8, bottom: 20, left: 44 };

/**
 * A column with the two top corners rounded and the baseline square, per the
 * mark spec. `rx` on a <rect> would round all four and float the bar off its
 * baseline.
 */
function columnPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h));
  if (r === 0) return `M${x},${y} h${w} v${h} h${-w} Z`;
  return [
    `M${x},${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V${y + h}`,
    `H${x}`,
    'Z',
  ].join(' ');
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round the axis maximum up to a clean number, so ticks read 0 / 50 / 100. */
function niceMax(value: number): number {
  if (value <= 5) return Math.max(1, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function formatTime(ms: number, bucketMs: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (bucketMs < 60_000) return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StackedColumns({
  data,
  series,
  height = 180,
  bucketMs,
  valueLabel,
  emptyMessage,
}: StackedColumnsProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const handleLeave = useCallback(() => setHovered(null), []);

  if (data.length === 0) {
    return (
      <div ref={wrapRef} className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400" style={{ height }}>
        {emptyMessage}
      </div>
    );
  }

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const band = data.length > 0 ? plotWidth / data.length : 0;
  // Cap the column and let the band's leftover be air, rather than filling the slot.
  const columnWidth = Math.min(MARK.maxColumnWidth, Math.max(1, band - MARK.gap));

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, 1));
  const ticks = [0, max / 2, max];

  const hoveredDatum = hovered !== null ? data[hovered] : null;

  return (
    <div ref={wrapRef} className="relative w-full" onPointerLeave={handleLeave}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${valueLabel} over time`}>
          {ticks.map((tick) => {
            const y = PADDING.top + plotHeight - (tick / max) * plotHeight;
            return (
              <g key={tick}>
                <line x1={PADDING.left} x2={width - PADDING.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text
                  x={PADDING.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={AXIS_TEXT}
                  className="tabular-nums"
                >
                  {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
                </text>
              </g>
            );
          })}

          {data.map((datum, i) => {
            const x = PADDING.left + i * band + (band - columnWidth) / 2;
            let cursor = PADDING.top + plotHeight;
            const total = totals[i];
            // The topmost non-empty segment carries the rounded cap.
            const topIndex = datum.values.reduce((acc, v, idx) => (v > 0 ? idx : acc), -1);

            return (
              <g key={datum.from} opacity={hovered === null || hovered === i ? 1 : 0.55}>
                {datum.values.map((value, s) => {
                  if (value <= 0) return null;
                  const full = (value / max) * plotHeight;
                  // The 2px surface gap is what separates segments; no stroke.
                  const drawn = Math.max(1, full - (s === topIndex ? 0 : MARK.gap));
                  const y = cursor - full;
                  cursor -= full;
                  const isTop = s === topIndex;
                  return (
                    <path
                      key={series[s].key}
                      d={columnPath(x, y, columnWidth, drawn, isTop ? MARK.cornerRadius : 0)}
                      fill={series[s].color}
                    />
                  );
                })}
                {/* Hit target spans the whole band, not just the painted column. */}
                <rect
                  x={PADDING.left + i * band}
                  y={PADDING.top}
                  width={Math.max(band, 1)}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatTime(datum.from, bucketMs)}: ${total} ${valueLabel}`}
                  onPointerEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  onBlur={handleLeave}
                  className="outline-none focus-visible:stroke-blue-400"
                  strokeWidth={2}
                />
              </g>
            );
          })}

          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={PADDING.top + plotHeight}
            y2={PADDING.top + plotHeight}
            stroke={GRID}
            strokeWidth={1}
          />

          {[0, Math.floor(data.length / 2), data.length - 1]
            .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
            .map((i) => (
              <text
                key={i}
                x={PADDING.left + i * band + band / 2}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                fontSize={10}
                fill={AXIS_TEXT}
                className="tabular-nums"
              >
                {formatTime(data[i].from, bucketMs)}
              </text>
            ))}
        </svg>
      )}

      {hoveredDatum && (
        <div
          className="absolute z-20 pointer-events-none rounded-md border border-gray-700 bg-gray-950/95 px-2.5 py-1.5 shadow-lg text-xs"
          style={{
            left: Math.min(
              Math.max(PADDING.left, PADDING.left + hovered! * band + band / 2 - 70),
              Math.max(PADDING.left, width - 150),
            ),
            top: 4,
          }}
        >
          <div className="text-[10px] text-gray-400 tabular-nums mb-1">
            {formatTime(hoveredDatum.from, bucketMs)} — {formatTime(hoveredDatum.from + bucketMs, bucketMs)}
          </div>
          {/* Every series at this X, so the pointer never has to find a segment. */}
          {series.map((s, i) =>
            hoveredDatum.values[i] > 0 ? (
              <div key={s.key} className="flex items-center gap-1.5 leading-snug">
                <span className="w-3 h-0.5 rounded-full shrink-0" style={{ background: s.color }} />
                {/* Value leads, label follows — the reader has the series, wants the number. */}
                <span className="text-gray-100 font-medium tabular-nums">
                  {hoveredDatum.values[i].toLocaleString('en-GB')}
                </span>
                <span className="text-gray-400">{s.label}</span>
              </div>
            ) : null,
          )}
          <div className="mt-1 pt-1 border-t border-gray-700 flex items-center gap-1.5">
            <span className="text-gray-100 font-medium tabular-nums">
              {totals[hovered!].toLocaleString('en-GB')}
            </span>
            <span className="text-gray-400">total</span>
          </div>
        </div>
      )}
    </div>
  );
}

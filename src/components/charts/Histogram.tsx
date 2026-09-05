'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AXIS_TEXT, GRID, MARK, sequentialStep } from '@/lib/chart-theme';

export interface HistogramBin {
  label: string;
  count: number;
  /** Longer description for the tooltip, e.g. "100 ms to 250 ms". */
  range: string;
}

interface HistogramProps {
  bins: HistogramBin[];
  /** Names what is plotted, for assistive tech. */
  label: string;
  height?: number;
  emptyMessage: string;
  onSelect?: (bin: HistogramBin, index: number) => void;
}

const PADDING = { top: 8, right: 8, bottom: 26, left: 44 };

function barPath(x: number, y: number, w: number, h: number, radius: number): string {
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

function niceMax(value: number): number {
  if (value <= 5) return Math.max(1, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * A single measure across ordered buckets, so the colour job is magnitude:
 * one hue, more-is-darker. One series means no legend — the card title says
 * what is plotted.
 */
export default function Histogram({ bins, label, height = 160, emptyMessage, onSelect }: HistogramProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const handleLeave = useCallback(() => setHovered(null), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const total = bins.reduce((a, b) => a + b.count, 0);
  if (total === 0) {
    return (
      <div
        ref={wrapRef}
        className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const band = bins.length ? plotWidth / bins.length : 0;
  const barWidth = Math.min(MARK.maxColumnWidth, Math.max(1, band - MARK.gap));
  const max = niceMax(Math.max(...bins.map((b) => b.count), 1));

  return (
    <div ref={wrapRef} className="relative w-full" onPointerLeave={handleLeave}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {[0, max / 2, max].map((tick) => {
            const y = PADDING.top + plotHeight - (tick / max) * plotHeight;
            return (
              <g key={tick}>
                <line x1={PADDING.left} x2={width - PADDING.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={PADDING.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT} className="tabular-nums">
                  {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
                </text>
              </g>
            );
          })}

          {bins.map((bin, i) => {
            const h = bin.count > 0 ? Math.max(2, (bin.count / max) * plotHeight) : 0;
            const x = PADDING.left + i * band + (band - barWidth) / 2;
            const y = PADDING.top + plotHeight - h;
            return (
              <g key={bin.label} opacity={hovered === null || hovered === i ? 1 : 0.55}>
                {h > 0 && (
                  <path
                    d={barPath(x, y, barWidth, h, MARK.cornerRadius)}
                    fill={sequentialStep(bins.length > 1 ? i / (bins.length - 1) : 0)}
                  />
                )}
                <rect
                  x={PADDING.left + i * band}
                  y={PADDING.top}
                  width={Math.max(band, 1)}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  role={onSelect ? 'button' : undefined}
                  aria-label={`${bin.range}: ${bin.count}`}
                  onPointerEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  onBlur={handleLeave}
                  onClick={() => onSelect?.(bin, i)}
                  onKeyDown={(e) => {
                    if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelect(bin, i);
                    }
                  }}
                  className={`outline-none ${onSelect ? 'cursor-pointer' : ''}`}
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

          {bins.map((bin, i) =>
            // Label every other bucket when they would otherwise collide.
            band > 34 || i % 2 === 0 ? (
              <text
                key={bin.label}
                x={PADDING.left + i * band + band / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={9}
                fill={AXIS_TEXT}
              >
                {bin.label}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {hovered !== null && (
        <div
          className="absolute z-20 pointer-events-none rounded-md border border-gray-700 bg-gray-950/95 px-2.5 py-1.5 shadow-lg text-xs"
          style={{
            left: Math.min(
              Math.max(PADDING.left, PADDING.left + hovered * band + band / 2 - 60),
              Math.max(PADDING.left, width - 130),
            ),
            top: 4,
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-gray-100 font-medium tabular-nums">
              {bins[hovered].count.toLocaleString('en-GB')}
            </span>
            <span className="text-gray-400">items</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{bins[hovered].range}</div>
        </div>
      )}
    </div>
  );
}

'use client';

import { MARK } from '@/lib/chart-theme';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Mark colour. A single series needs no legend — the label beside it names it. */
  color: string;
  /** Accessible summary; the numbers themselves stay reachable in the table. */
  label: string;
}

/**
 * A twelve-or-so point trend, sized to sit inside a stat tile or a table cell.
 * Deliberately spare: no axes, no grid, no labels — the value beside it carries
 * the number, and this only has to carry the shape.
 */
export default function Sparkline({
  values,
  width = 96,
  height = 24,
  color,
  label,
}: SparklineProps) {
  if (values.length === 0) return <span className="inline-block" style={{ width, height }} />;

  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  // Leave room for the 2px stroke and the end dot's ring.
  const inset = MARK.lineWidth + 2;
  const usable = height - inset * 2;

  const points = values.map((v, i) => {
    const x = values.length > 1 ? i * step : width / 2;
    const y = inset + usable - (v / max) * usable;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      {/* Area wash at ~10% — never a saturated block. */}
      <path d={area} fill={color} fillOpacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={MARK.lineWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* End marker with a surface ring, so it stays legible over the line. */}
      <circle cx={lastX} cy={lastY} r={4} fill={color} stroke="var(--chart-surface)" strokeWidth={2} />
    </svg>
  );
}

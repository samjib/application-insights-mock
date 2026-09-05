import type { TelemetryType } from './types';

/**
 * Chart colours, validated rather than chosen by eye.
 *
 * The categorical slots below are the hue families the dashboard already uses for
 * its type badges, stepped for a dark surface. Run through the palette validator
 * in the stacking order used by the volume chart, against both surfaces the
 * charts sit on (`#111827` cards, `#030712` page):
 *
 *   Lightness band       PASS  all 5 inside L 0.48–0.67
 *   Chroma floor         PASS  all 5 >= 0.1
 *   CVD separation       PASS  worst adjacent ΔE 19.5 (protan)
 *   Normal-vision floor  PASS  worst adjacent ΔE 20.9
 *   Contrast vs surface  PASS  all 5 >= 3:1
 *
 * Two constraints are load-bearing and easy to undo by accident:
 *  - Tailwind's own ramps cannot pass. Its -400 steps sit above the lightness
 *    band; darkening yellow far enough to enter the band drops red↔yellow to
 *    ΔE 5.2 under deuteranopia, a hard fail.
 *  - The stacking order matters. Yellow next to red fails the normal-vision
 *    floor (ΔE 13.0); the order below keeps them apart, and happens to put
 *    exceptions on top of the stack where they are most visible.
 */

export const SERIES = {
  Request: '#199e70',
  Dependency: '#3987e5',
  Trace: '#c98500',
  Event: '#9085e9',
  Exception: '#e66767',
  /** Everything else — de-emphasis gray, never a generated hue. */
  Other: '#6b7280',
} as const;

export type SeriesKey = keyof typeof SERIES;

/** Bottom to top. Changing this order invalidates the checks above. */
export const STACK_ORDER: SeriesKey[] = [
  'Request',
  'Dependency',
  'Trace',
  'Event',
  'Exception',
  'Other',
];

/** Plural names for legends — "Dependencys" is what appending an s gets you. */
export const SERIES_LABEL: Record<SeriesKey, string> = {
  Request: 'Requests',
  Dependency: 'Dependencies',
  Trace: 'Traces',
  Event: 'Events',
  Exception: 'Exceptions',
  Other: 'Other',
};

export function seriesForType(type: TelemetryType): SeriesKey {
  switch (type) {
    case 'Request':
    case 'Dependency':
    case 'Trace':
    case 'Event':
    case 'Exception':
      return type;
    default:
      return 'Other';
  }
}

/**
 * Status roles, reserved for state and never reused as a series colour. The
 * lightness band does not apply to status; contrast does, and all three clear
 * 3:1 on both surfaces. They always ship with a label — never colour alone.
 */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** HTTP status class -> role. `2xx`/`3xx` are good, `4xx` is the caller's fault, `5xx` ours. */
export function statusRole(code: string): keyof typeof STATUS {
  const n = Number(code);
  if (!Number.isFinite(n)) return 'serious';
  if (n >= 500) return 'critical';
  if (n >= 400) return 'warning';
  return 'good';
}

/**
 * Sequential ramp for magnitude — one hue, light to dark. Used by the latency
 * histogram, where the bars are a single measure rather than distinct series.
 */
export const SEQUENTIAL = ['#9ec7f2', '#6ea9ea', '#3987e5', '#2a68b4', '#1d4a80'] as const;

export function sequentialStep(fraction: number): string {
  const i = Math.min(SEQUENTIAL.length - 1, Math.max(0, Math.round(fraction * (SEQUENTIAL.length - 1))));
  return SEQUENTIAL[i];
}

// --- Chrome ---

/** One step off the surface: recessive, hairline, solid. */
export const GRID = 'rgb(255 255 255 / 0.08)';
export const AXIS_TEXT = 'rgb(156 163 175)'; // gray-400 — a text token, never a series colour
/** The colour the 2px spacers are "made of" — the card surface showing through. */
export const SURFACE = 'var(--chart-surface)';

/** Mark specs, fixed across every chart in the app. */
export const MARK = {
  maxColumnWidth: 24,
  cornerRadius: 4,
  /** Surface gap between touching marks, and between stacked segments. */
  gap: 2,
  lineWidth: 2,
} as const;

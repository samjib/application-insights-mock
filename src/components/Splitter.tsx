'use client';

import { useCallback, useRef } from 'react';
import { MAX_SPLIT, MIN_SPLIT, clampSplit } from '@/lib/view-state';

const KEYBOARD_STEP = 0.02;

interface SplitterProps {
  /** Element the fraction is measured against. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  fraction: number;
  onChange: (fraction: number) => void;
}

export default function Splitter({ containerRef, fraction, onChange }: SplitterProps) {
  const draggingRef = useRef(false);

  const fractionFromEvent = useCallback(
    (clientX: number): number | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return null;
      return clampSplit((clientX - rect.left) / rect.width);
    },
    [containerRef],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      // The list is virtualised, so a resize is cheap; text selection is not.
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const next = fractionFromEvent(e.clientX);
      if (next !== null) onChange(next);
    },
    [fractionFromEvent, onChange],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = clampSplit(fraction - KEYBOARD_STEP);
      else if (e.key === 'ArrowRight') next = clampSplit(fraction + KEYBOARD_STEP);
      else if (e.key === 'Home') next = MIN_SPLIT;
      else if (e.key === 'End') next = MAX_SPLIT;
      if (next === null) return;
      e.preventDefault();
      onChange(next);
    },
    [fraction, onChange],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize detail pane"
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={Math.round(MIN_SPLIT * 100)}
      aria-valuemax={Math.round(MAX_SPLIT * 100)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onChange(0.5)}
      title="Drag to resize · double-click to centre"
      className="group relative w-1 shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 focus:outline-none focus-visible:bg-blue-500 transition-colors"
    >
      {/* Widened hit area without widening the visual divider. */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}

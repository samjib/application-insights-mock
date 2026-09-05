'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary. A single malformed telemetry item used to take the
 * whole dashboard down with an unrecoverable blank page; this keeps the failure
 * visible and recoverable without a devtools session.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] render failed:', error);
  }, [error]);

  async function clearTelemetry() {
    try {
      await fetch('/api/events', { method: 'DELETE' });
    } catch {
      /* noop */
    }
    reset();
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-950 p-6">
      <div className="max-w-lg text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-lg font-semibold text-gray-200">The dashboard hit an error</h1>
        <p className="text-sm text-gray-400 mt-2">
          Live telemetry is still being captured — only the view stopped rendering.
        </p>
        <pre className="mt-4 px-3 py-2 bg-gray-900 border border-gray-800 rounded text-[11px] text-left text-red-300 whitespace-pre-wrap break-all font-mono max-h-40 overflow-y-auto">
          {error.message}
        </pre>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 hover:bg-blue-900 transition-colors cursor-pointer"
          >
            Try again
          </button>
          <button
            onClick={clearTelemetry}
            className="px-3 py-1.5 rounded text-xs font-medium bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors cursor-pointer"
            title="Discard all captured telemetry and re-render"
          >
            Clear telemetry and retry
          </button>
        </div>
      </div>
    </div>
  );
}

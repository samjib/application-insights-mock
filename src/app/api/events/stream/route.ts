import { telemetryStore } from '@/lib/telemetry-store';
import { TelemetryItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  let onItem: ((item: TelemetryItem) => void) | undefined;
  let onClear: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      onItem = (item: TelemetryItem) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      onClear = () => {
        try {
          controller.enqueue(encoder.encode(`event: clear\ndata: {}\n\n`));
        } catch {
          // Stream closed
        }
      };

      telemetryStore.emitter.on('item', onItem);
      telemetryStore.emitter.on('clear', onClear);

      controller.enqueue(encoder.encode(`: connected\n\n`));

      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);
    },
    cancel() {
      if (onItem) telemetryStore.emitter.off('item', onItem);
      if (onClear) telemetryStore.emitter.off('clear', onClear);
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

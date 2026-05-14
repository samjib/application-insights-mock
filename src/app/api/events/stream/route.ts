import { telemetryStore, Batch } from '@/lib/telemetry-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  let onBatch: ((batch: Batch) => void) | undefined;
  let onClear: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      onBatch = (batch) => {
        send(`data: ${JSON.stringify(batch)}\n\n`);
      };

      onClear = () => {
        send(`event: clear\ndata: {}\n\n`);
      };

      telemetryStore.emitter.on('batch', onBatch);
      telemetryStore.emitter.on('clear', onClear);

      send(`: connected\n\n`);

      keepalive = setInterval(() => send(`: keepalive\n\n`), 15_000);
    },
    cancel() {
      closed = true;
      if (onBatch) telemetryStore.emitter.off('batch', onBatch);
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

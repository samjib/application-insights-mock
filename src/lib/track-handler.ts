import { NextRequest, NextResponse } from 'next/server';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { telemetryStore } from '@/lib/telemetry-store';
import { Envelope } from '@/lib/types';

const gunzipAsync = promisify(gunzip);

const DEFAULT_MAX_BODY = 10 * 1024 * 1024; // 10 MB
const MAX_BODY_BYTES = (() => {
  const raw = process.env.MAX_BODY_BYTES;
  if (!raw) return DEFAULT_MAX_BODY;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BODY;
})();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
};

function requestContextHeader(iKey: string | undefined): Record<string, string> {
  if (!iKey) return {};
  return { 'Request-Context': `appId=cid-v1:${iKey}` };
}

function parseEnvelopes(raw: string): Envelope[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as Envelope[];
  }

  if (trimmed.startsWith('{') && !trimmed.includes('\n')) {
    return [JSON.parse(trimmed) as Envelope];
  }

  return trimmed
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Envelope);
}

function rejectTooLarge() {
  return NextResponse.json(
    {
      itemsReceived: 0,
      itemsAccepted: 0,
      errors: [{ index: 0, statusCode: 413, message: 'Payload too large' }],
    },
    { status: 413, headers: CORS_HEADERS },
  );
}

export async function handleTrack(request: NextRequest) {
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return rejectTooLarge();

    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.byteLength > MAX_BODY_BYTES) return rejectTooLarge();

    const encoding = request.headers.get('content-encoding');
    const bodyText =
      encoding === 'gzip'
        ? (await gunzipAsync(buffer)).toString('utf-8')
        : buffer.toString('utf-8');

    const envelopes = parseEnvelopes(bodyText);
    telemetryStore.addMany(envelopes);
    const iKey = envelopes[0]?.iKey;

    return NextResponse.json(
      {
        itemsReceived: envelopes.length,
        itemsAccepted: envelopes.length,
        errors: [],
      },
      { status: 200, headers: { ...CORS_HEADERS, ...requestContextHeader(iKey) } },
    );
  } catch (err) {
    console.error('[track] Error processing telemetry:', err);
    return NextResponse.json(
      {
        itemsReceived: 0,
        itemsAccepted: 0,
        errors: [
          {
            index: 0,
            statusCode: 400,
            message: err instanceof Error ? err.message : 'Invalid payload',
          },
        ],
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }
}

export function handleOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function handleHealthCheck() {
  return NextResponse.json(
    {
      status: 'ok',
      message: 'Mock Application Insights ingestion endpoint',
      capacity: telemetryStore.max,
      count: telemetryStore.count,
    },
    { headers: CORS_HEADERS },
  );
}

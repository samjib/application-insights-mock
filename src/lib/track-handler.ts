import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { telemetryStore } from '@/lib/telemetry-store';
import { Envelope } from '@/lib/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
};

function parseEnvelopes(raw: string): Envelope[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try standard JSON array first
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as Envelope[];
  }

  // Try single JSON object
  if (trimmed.startsWith('{') && !trimmed.includes('\n')) {
    return [JSON.parse(trimmed) as Envelope];
  }

  // Line-delimited JSON (newline-delimited JSON / x-json-stream)
  return trimmed
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Envelope);
}

export async function handleTrack(request: NextRequest) {
  try {
    const contentEncoding = request.headers.get('content-encoding');
    let bodyText: string;

    if (contentEncoding === 'gzip') {
      const buffer = Buffer.from(await request.arrayBuffer());
      const decompressed = gunzipSync(buffer);
      bodyText = decompressed.toString('utf-8');
    } else {
      bodyText = await request.text();
    }

    const envelopes = parseEnvelopes(bodyText);
    const items = telemetryStore.addMany(envelopes);

    return NextResponse.json(
      {
        itemsReceived: envelopes.length,
        itemsAccepted: items.length,
        errors: [],
      },
      { status: 200, headers: CORS_HEADERS }
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
      { status: 400, headers: CORS_HEADERS }
    );
  }
}

export function handleOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function handleHealthCheck() {
  return NextResponse.json({ status: 'ok', message: 'Mock Application Insights ingestion endpoint' }, { headers: CORS_HEADERS });
}

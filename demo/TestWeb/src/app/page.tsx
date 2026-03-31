'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ApplicationInsights, SeverityLevel } from '@microsoft/applicationinsights-web';

const GATEWAY_URL = 'http://localhost:5100';

const ENDPOINTS = [
  { label: 'List Users', path: '/api/users', method: 'GET' as const },
  { label: 'Get User 1', path: '/api/users/1', method: 'GET' as const },
  { label: 'Get User 0 (error)', path: '/api/users/0', method: 'GET' as const },
  { label: 'List Products', path: '/api/products', method: 'GET' as const },
  { label: 'Get Product 103', path: '/api/products/103', method: 'GET' as const },
  { label: 'List Orders', path: '/api/orders', method: 'GET' as const },
  { label: 'Slow Request', path: '/api/slow', method: 'GET' as const },
  { label: 'Chain Error', path: '/api/chain-error', method: 'GET' as const },
  { label: 'Gateway Error', path: '/api/error', method: 'GET' as const },
  { label: 'Health Check', path: '/health', method: 'GET' as const },
] as const;

export default function TestPage() {
  const [responses, setResponses] = useState<
    { endpoint: string; status: number | string; body: string; ts: string }[]
  >([]);
  const [sdkReady, setSdkReady] = useState(false);
  const [orderQty, setOrderQty] = useState(1);
  const [orderProductId, setOrderProductId] = useState(101);
  const aiRef = useRef<ApplicationInsights | null>(null);

  useEffect(() => {
    const ai = new ApplicationInsights({
      config: {
        connectionString:
          'InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://localhost:3000',
        enableAutoRouteTracking: true,
        disableFetchTracking: false,
        enableCorsCorrelation: true,
        enableRequestHeaderTracking: true,
        enableResponseHeaderTracking: true,
        correlationHeaderExcludedDomains: [],
      },
    });
    ai.loadAppInsights();
    ai.trackPageView();
    aiRef.current = ai;
    setSdkReady(true);
  }, []);

  const addLog = useCallback(
    (endpoint: string, status: number | string, body: string) => {
      const ts = new Date().toLocaleTimeString('en-GB', { fractionalSecondDigits: 3 });
      setResponses((prev) => [{ endpoint, status, body, ts }, ...prev]);
    },
    [],
  );

  const callEndpoint = useCallback(
    async (path: string) => {
      try {
        const res = await fetch(`${GATEWAY_URL}${path}`);
        const text = await res.text();
        let body: string;
        try {
          body = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          body = text;
        }
        addLog(path, res.status, body);
      } catch (err) {
        addLog(path, 'ERR', err instanceof Error ? err.message : String(err));
      }
    },
    [addLog],
  );

  const placeOrder = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: orderProductId, quantity: orderQty }),
      });
      const text = await res.text();
      let body: string;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        body = text;
      }
      addLog('POST /api/orders', res.status, body);
    } catch (err) {
      addLog('POST /api/orders', 'ERR', err instanceof Error ? err.message : String(err));
    }
  }, [orderProductId, orderQty, addLog]);

  const trackCustomEvent = useCallback(() => {
    if (!aiRef.current) return;
    aiRef.current.trackEvent(
      { name: 'TestButtonClicked' },
      { source: 'TestWeb', timestamp: new Date().toISOString() },
    );
    aiRef.current.flush();
    addLog('trackEvent', 'OK', 'Custom event sent');
  }, [addLog]);

  const trackCustomMetric = useCallback(() => {
    if (!aiRef.current) return;
    const value = Math.round(Math.random() * 1000);
    aiRef.current.trackMetric({ name: 'RandomTestMetric', average: value });
    aiRef.current.flush();
    addLog('trackMetric', 'OK', `Metric: RandomTestMetric = ${value}`);
  }, [addLog]);

  const trackException = useCallback(() => {
    if (!aiRef.current) return;
    try {
      // Simulate a caught error
      throw new Error('Simulated client-side error for testing');
    } catch (e) {
      aiRef.current.trackException({
        exception: e as Error,
        severityLevel: SeverityLevel.Error,
        properties: { source: 'TestWeb', action: 'trackException button' },
      });
      aiRef.current.flush();
      addLog('trackException', 'OK', `Exception tracked: ${(e as Error).message}`);
    }
  }, [addLog]);

  const trackTrace = useCallback(() => {
    if (!aiRef.current) return;
    const levels: { level: SeverityLevel; label: string }[] = [
      { level: SeverityLevel.Verbose, label: 'Verbose' },
      { level: SeverityLevel.Information, label: 'Information' },
      { level: SeverityLevel.Warning, label: 'Warning' },
      { level: SeverityLevel.Error, label: 'Error' },
    ];
    const pick = levels[Math.floor(Math.random() * levels.length)];
    aiRef.current.trackTrace({
      message: `Sample ${pick.label} trace from TestWeb at ${new Date().toISOString()}`,
      severityLevel: pick.level,
      properties: { source: 'TestWeb' },
    });
    aiRef.current.flush();
    addLog('trackTrace', 'OK', `Trace sent (${pick.label})`);
  }, [addLog]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Test Web — AI Browser SDK</h1>
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${sdkReady ? 'bg-emerald-500' : 'bg-red-500'}`}
          title={sdkReady ? 'SDK loaded' : 'SDK loading...'}
        />
      </div>

      <p className="text-sm text-gray-400">
        Calls Gateway at <code className="text-gray-300">{GATEWAY_URL}</code>. Telemetry sent to{' '}
        <code className="text-gray-300">http://localhost:3000</code>. Open the{' '}
        <a href="http://localhost:3000" target="_blank" className="text-blue-400 hover:underline">
          dashboard
        </a>{' '}
        to see live telemetry.
      </p>

      {/* API endpoint buttons */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Gateway Endpoints</h2>
        <div className="flex flex-wrap gap-2">
          {ENDPOINTS.map((ep) => (
            <button
              key={ep.path}
              onClick={() => callEndpoint(ep.path)}
              className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors"
            >
              {ep.label}
            </button>
          ))}
        </div>
      </section>

      {/* Place order */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Place Order</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">
            Product
            <select
              value={orderProductId}
              onChange={(e) => setOrderProductId(Number(e.target.value))}
              className="ml-2 px-2 py-1 rounded bg-gray-800 text-white text-sm"
            >
              <option value={101}>Widget A ($9.99)</option>
              <option value={102}>Widget B ($24.50)</option>
              <option value={103}>Gadget Pro ($149)</option>
              <option value={104}>Thingamajig ($3.25 — out of stock)</option>
            </select>
          </label>
          <label className="text-sm text-gray-400">
            Qty
            <input
              type="number"
              min={1}
              max={999}
              value={orderQty}
              onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value)))}
              className="ml-2 w-16 px-2 py-1 rounded bg-gray-800 text-white text-sm"
            />
          </label>
          <button
            onClick={placeOrder}
            className="px-4 py-2 rounded bg-emerald-800 hover:bg-emerald-700 text-sm font-medium transition-colors"
          >
            Place Order
          </button>
        </div>
      </section>

      {/* Custom telemetry buttons */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Custom Telemetry</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={trackCustomEvent}
            className="px-4 py-2 rounded bg-purple-800 hover:bg-purple-700 text-sm font-medium transition-colors"
          >
            Track Event
          </button>
          <button
            onClick={trackCustomMetric}
            className="px-4 py-2 rounded bg-orange-800 hover:bg-orange-700 text-sm font-medium transition-colors"
          >
            Track Metric
          </button>
          <button
            onClick={trackException}
            className="px-4 py-2 rounded bg-red-800 hover:bg-red-700 text-sm font-medium transition-colors"
          >
            Track Exception
          </button>
          <button
            onClick={trackTrace}
            className="px-4 py-2 rounded bg-cyan-800 hover:bg-cyan-700 text-sm font-medium transition-colors"
          >
            Track Trace
          </button>
        </div>
      </section>

      {/* Response log */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Response Log</h2>
          {responses.length > 0 && (
            <button
              onClick={() => setResponses([])}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {responses.length === 0 && (
            <div className="text-gray-500 text-sm">No responses yet. Click a button above.</div>
          )}
          {responses.map((r, i) => (
            <div
              key={`${r.ts}-${i}`}
              className="rounded bg-gray-900 border border-gray-800 p-3 text-sm space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-mono text-xs">{r.ts}</span>
                <span className="font-medium">{r.endpoint}</span>
                <span
                  className={`ml-auto text-xs font-mono px-1.5 py-0.5 rounded ${
                    r.status === 200 || r.status === 201
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : r.status === 'OK'
                        ? 'bg-blue-900/50 text-blue-400'
                        : 'bg-red-900/50 text-red-400'
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <pre className="text-xs text-gray-400 whitespace-pre-wrap wrap-break-word max-h-40 overflow-y-auto">
                {r.body}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

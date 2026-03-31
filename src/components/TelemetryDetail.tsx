'use client';

import { useState } from 'react';
import {
  TelemetryItem,
  RequestData,
  RemoteDependencyData,
  ExceptionData,
  MessageData,
  EventData,
  MetricData,
  PageviewData,
  PageviewPerformanceData,
  SEVERITY_LEVEL_MAP,
} from '@/lib/types';

interface TelemetryDetailProps {
  item: TelemetryItem;
  onClose: () => void;
  onFilter?: (value: string) => void;
}

function KeyValue({ label, value, onFilter }: { label: string; value: string | number | boolean | undefined | null; onFilter?: (value: string) => void }) {
  if (value === undefined || value === null) return null;
  const strVal = String(value);
  return (
    <div className="flex gap-2 py-0.5 group">
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-35 text-right font-medium">
        {label}:
      </span>
      <span className="text-xs text-gray-800 dark:text-gray-200 break-all font-mono flex-1">{strVal}</span>
      {onFilter && strVal.length > 0 && strVal.length < 200 && (
        <button
          onClick={() => onFilter(strVal)}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:text-indigo-300 dark:hover:bg-indigo-900/50 rounded px-0.5 transition-all cursor-pointer"
          title={`Filter by ${strVal}`}
        >
          🔍
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 border-b border-gray-200 dark:border-gray-700 pb-1">
        {title}
      </h3>
      <div className="pl-1">{children}</div>
    </div>
  );
}

function PropsTable({ data, onFilter }: { data?: Record<string, string>; onFilter?: (value: string) => void }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([k, v]) => (
        <KeyValue key={k} label={k} value={v} onFilter={onFilter} />
      ))}
    </div>
  );
}

function MeasurementsTable({ data, onFilter }: { data?: Record<string, number>; onFilter?: (value: string) => void }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([k, v]) => (
        <KeyValue key={k} label={k} value={v} onFilter={onFilter} />
      ))}
    </div>
  );
}

function RequestDetail({ data, onFilter }: { data: RequestData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Request">
        <KeyValue label="Name" value={data.name} onFilter={onFilter} />
        <KeyValue label="URL" value={data.url} onFilter={onFilter} />
        <KeyValue label="ID" value={data.id} onFilter={onFilter} />
        <KeyValue label="Response Code" value={data.responseCode} onFilter={onFilter} />
        <KeyValue label="Success" value={data.success} />
        <KeyValue label="Duration" value={data.duration} />
        <KeyValue label="Source" value={data.source} onFilter={onFilter} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements"><MeasurementsTable data={data.measurements} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function DependencyDetail({ data, onFilter }: { data: RemoteDependencyData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Dependency">
        <KeyValue label="Name" value={data.name} onFilter={onFilter} />
        <KeyValue label="Type" value={data.type} onFilter={onFilter} />
        <KeyValue label="Target" value={data.target} onFilter={onFilter} />
        <KeyValue label="Data" value={data.data} onFilter={onFilter} />
        <KeyValue label="ID" value={data.id} onFilter={onFilter} />
        <KeyValue label="Result Code" value={data.resultCode} onFilter={onFilter} />
        <KeyValue label="Success" value={data.success} />
        <KeyValue label="Duration" value={data.duration} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements"><MeasurementsTable data={data.measurements} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function ExceptionDetail({ data, onFilter }: { data: ExceptionData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Exception">
        <KeyValue label="Severity" value={data.severityLevel !== undefined ? SEVERITY_LEVEL_MAP[data.severityLevel] : undefined} onFilter={onFilter} />
        <KeyValue label="Problem ID" value={data.problemId} onFilter={onFilter} />
      </Section>
      {data.exceptions?.map((ex, i) => (
        <Section key={i} title={`Exception ${i + 1}: ${ex.typeName}`}>
          <KeyValue label="Type" value={ex.typeName} onFilter={onFilter} />
          <KeyValue label="Message" value={ex.message} onFilter={onFilter} />
          <KeyValue label="Has Full Stack" value={ex.hasFullStack} />
          {ex.stack && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Stack Trace:</span>
              <pre className="text-[11px] mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto font-mono text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {ex.stack}
              </pre>
            </div>
          )}
          {ex.parsedStack && ex.parsedStack.length > 0 && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Parsed Stack:</span>
              <div className="mt-1 space-y-0.5">
                {ex.parsedStack.map((frame, fi) => (
                  <div key={fi} className="text-[11px] font-mono text-gray-600 dark:text-gray-400 pl-2">
                    <span className="text-gray-400 dark:text-gray-500 mr-1">{frame.level}.</span>
                    <span className="text-blue-600 dark:text-blue-400">{frame.method}</span>
                    {frame.fileName && (
                      <span className="text-gray-500">
                        {' '}at {frame.fileName}
                        {frame.line !== undefined && `:${frame.line}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      ))}
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function TraceDetail({ data, onFilter }: { data: MessageData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Trace">
        <KeyValue label="Message" value={data.message} onFilter={onFilter} />
        <KeyValue label="Severity" value={data.severityLevel !== undefined ? SEVERITY_LEVEL_MAP[data.severityLevel] : undefined} onFilter={onFilter} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function EventDetail({ data, onFilter }: { data: EventData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Event">
        <KeyValue label="Name" value={data.name} onFilter={onFilter} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements"><MeasurementsTable data={data.measurements} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function MetricDetail({ data, onFilter }: { data: MetricData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Metrics">
        {data.metrics?.map((m, i) => (
          <div key={i} className="mb-2">
            <KeyValue label="Name" value={m.name} onFilter={onFilter} />
            <KeyValue label="Value" value={m.value} />
            <KeyValue label="Count" value={m.count} />
            <KeyValue label="Min" value={m.min} />
            <KeyValue label="Max" value={m.max} />
            <KeyValue label="Std Dev" value={m.stdDev} />
          </div>
        ))}
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function PageviewDetail({ data, onFilter }: { data: PageviewData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Page View">
        <KeyValue label="Name" value={data.name} onFilter={onFilter} />
        <KeyValue label="URL" value={data.url} onFilter={onFilter} />
        <KeyValue label="ID" value={data.id} onFilter={onFilter} />
        <KeyValue label="Duration" value={data.duration} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements"><MeasurementsTable data={data.measurements} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

function PageviewPerfDetail({ data, onFilter }: { data: PageviewPerformanceData; onFilter?: (value: string) => void }) {
  return (
    <>
      <Section title="Page View Performance">
        <KeyValue label="Name" value={data.name} onFilter={onFilter} />
        <KeyValue label="URL" value={data.url} onFilter={onFilter} />
        <KeyValue label="Duration" value={data.duration} />
        <KeyValue label="Total" value={data.perfTotal} />
        <KeyValue label="Network Connect" value={data.networkConnect} />
        <KeyValue label="Sent Request" value={data.sentRequest} />
        <KeyValue label="Received Response" value={data.receivedResponse} />
        <KeyValue label="DOM Processing" value={data.domProcessing} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties"><PropsTable data={data.properties} onFilter={onFilter} /></Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements"><MeasurementsTable data={data.measurements} onFilter={onFilter} /></Section>
      )}
    </>
  );
}

export default function TelemetryDetail({ item, onClose, onFilter }: TelemetryDetailProps) {
  const [showRaw, setShowRaw] = useState(false);
  const envelope = item.envelope;
  const bd = envelope.data?.baseData;

  return (
    <div className="h-full flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
          {item.type}: {item.summary}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              showRaw
                ? 'bg-gray-700 text-white dark:bg-gray-300 dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {showRaw ? 'Formatted' : 'Raw JSON'}
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none cursor-pointer"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {showRaw ? (
          <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
            {JSON.stringify(envelope, null, 2)}
          </pre>
        ) : (
          <>
            {/* Envelope context */}
            <Section title="Envelope">
              <KeyValue label="Time" value={item.timestamp} />
              <KeyValue label="Type" value={item.type} />
              <KeyValue label="Envelope Name" value={envelope.name} onFilter={onFilter} />
              <KeyValue label="Base Type" value={envelope.data?.baseType} onFilter={onFilter} />
              <KeyValue label="iKey" value={envelope.iKey} onFilter={onFilter} />
              <KeyValue label="Sequence" value={envelope.seq} />
              <KeyValue label="Sample Rate" value={envelope.sampleRate} />
            </Section>

            {/* Tags */}
            {envelope.tags && Object.keys(envelope.tags).length > 0 && (
              <Section title="Tags">
                <PropsTable data={envelope.tags} onFilter={onFilter} />
              </Section>
            )}

            {/* Type-specific detail */}
            {bd && item.type === 'Request' && <RequestDetail data={bd as RequestData} onFilter={onFilter} />}
            {bd && item.type === 'Dependency' && <DependencyDetail data={bd as RemoteDependencyData} onFilter={onFilter} />}
            {bd && item.type === 'Exception' && <ExceptionDetail data={bd as ExceptionData} onFilter={onFilter} />}
            {bd && item.type === 'Trace' && <TraceDetail data={bd as MessageData} onFilter={onFilter} />}
            {bd && item.type === 'Event' && <EventDetail data={bd as EventData} onFilter={onFilter} />}
            {bd && item.type === 'Metric' && <MetricDetail data={bd as MetricData} onFilter={onFilter} />}
            {bd && item.type === 'PageView' && <PageviewDetail data={bd as PageviewData} onFilter={onFilter} />}
            {bd && item.type === 'PageViewPerf' && <PageviewPerfDetail data={bd as PageviewPerformanceData} onFilter={onFilter} />}
          </>
        )}
      </div>
    </div>
  );
}

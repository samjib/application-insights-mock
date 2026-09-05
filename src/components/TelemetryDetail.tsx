'use client';

import { useState } from 'react';
import {
  EventData,
  ExceptionData,
  MessageData,
  MetricData,
  PageviewData,
  PageviewPerformanceData,
  RemoteDependencyData,
  RequestData,
  SEVERITY_LEVEL_MAP,
  TelemetryItem,
  formatDuration,
} from '@/lib/types';

interface TelemetryDetailProps {
  item: TelemetryItem;
  onClose: () => void;
  onSearch?: (value: string) => void;
  onFilterByOperation?: (opId: string) => void;
}

interface KVProps {
  label: string;
  value: string | number | boolean | undefined | null;
  onSearch?: (value: string) => void;
  action?: { label: string; title: string; onClick: () => void };
}

function KeyValue({ label, value, onSearch, action }: KVProps) {
  if (value === undefined || value === null) return null;
  const strVal = String(value);
  const searchable = onSearch && strVal.length > 0 && strVal.length < 200;
  return (
    <div className="flex gap-2 py-0.5 group items-start">
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 w-35 text-right font-medium pt-0.5">
        {label}:
      </span>
      <span className="text-xs text-gray-800 dark:text-gray-200 break-all font-mono flex-1">{strVal}</span>
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {action && (
          <button
            onClick={action.onClick}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:text-indigo-300 dark:hover:bg-indigo-900/50 rounded px-1 py-0.5 cursor-pointer whitespace-nowrap"
            title={action.title}
          >
            {action.label}
          </button>
        )}
        {searchable && (
          <button
            onClick={() => onSearch!(strVal)}
            className="text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 rounded px-1 py-0.5 cursor-pointer"
            title="Search for this value"
          >
            search
          </button>
        )}
      </div>
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

function PropsTable({ data, onSearch }: { data?: Record<string, string>; onSearch?: (value: string) => void }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([k, v]) => (
        <KeyValue key={k} label={k} value={v} onSearch={onSearch} />
      ))}
    </div>
  );
}

function TagsTable({
  data,
  onSearch,
  onFilterByOperation,
}: {
  data?: Record<string, string>;
  onSearch?: (value: string) => void;
  onFilterByOperation?: (opId: string) => void;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([k, v]) => {
        const action =
          k === 'ai.operation.id' && onFilterByOperation
            ? { label: 'filter op', title: 'Filter list to this operation', onClick: () => onFilterByOperation(v) }
            : undefined;
        return <KeyValue key={k} label={k} value={v} onSearch={onSearch} action={action} />;
      })}
    </div>
  );
}

function MeasurementsTable({ data }: { data?: Record<string, number> }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="space-y-0.5">
      {Object.entries(data).map(([k, v]) => (
        <KeyValue key={k} label={k} value={v} />
      ))}
    </div>
  );
}

function RequestDetail({ data, onSearch }: { data: RequestData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Request">
        <KeyValue label="Name" value={data.name} onSearch={onSearch} />
        <KeyValue label="URL" value={data.url} onSearch={onSearch} />
        <KeyValue label="ID" value={data.id} onSearch={onSearch} />
        <KeyValue label="Response Code" value={data.responseCode} onSearch={onSearch} />
        <KeyValue label="Success" value={data.success} />
        <KeyValue label="Duration" value={formatDuration(data.duration)} />
        <KeyValue label="Source" value={data.source} onSearch={onSearch} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements">
          <MeasurementsTable data={data.measurements} />
        </Section>
      )}
    </>
  );
}

function DependencyDetail({ data, onSearch }: { data: RemoteDependencyData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Dependency">
        <KeyValue label="Name" value={data.name} onSearch={onSearch} />
        <KeyValue label="Type" value={data.type} onSearch={onSearch} />
        <KeyValue label="Target" value={data.target} onSearch={onSearch} />
        <KeyValue label="Data" value={data.data} onSearch={onSearch} />
        <KeyValue label="ID" value={data.id} onSearch={onSearch} />
        <KeyValue label="Result Code" value={data.resultCode} onSearch={onSearch} />
        <KeyValue label="Success" value={data.success} />
        <KeyValue label="Duration" value={formatDuration(data.duration)} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements">
          <MeasurementsTable data={data.measurements} />
        </Section>
      )}
    </>
  );
}

function ExceptionDetail({ data, onSearch }: { data: ExceptionData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Exception">
        <KeyValue
          label="Severity"
          value={data.severityLevel !== undefined ? SEVERITY_LEVEL_MAP[data.severityLevel] : undefined}
          onSearch={onSearch}
        />
        <KeyValue label="Problem ID" value={data.problemId} onSearch={onSearch} />
      </Section>
      {data.exceptions?.map((ex, i) => (
        <Section key={i} title={`Exception ${i + 1}: ${ex.typeName}`}>
          <KeyValue label="Type" value={ex.typeName} onSearch={onSearch} />
          <KeyValue label="Message" value={ex.message} onSearch={onSearch} />
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
                        {' '}
                        at {frame.fileName}
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
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
    </>
  );
}

function TraceDetail({ data, onSearch }: { data: MessageData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Trace">
        <KeyValue label="Message" value={data.message} onSearch={onSearch} />
        <KeyValue
          label="Severity"
          value={data.severityLevel !== undefined ? SEVERITY_LEVEL_MAP[data.severityLevel] : undefined}
          onSearch={onSearch}
        />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
    </>
  );
}

function EventDetail({ data, onSearch }: { data: EventData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Event">
        <KeyValue label="Name" value={data.name} onSearch={onSearch} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements">
          <MeasurementsTable data={data.measurements} />
        </Section>
      )}
    </>
  );
}

function MetricDetail({ data, onSearch }: { data: MetricData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Metrics">
        {data.metrics?.map((m, i) => (
          <div key={i} className="mb-2">
            <KeyValue label="Name" value={m.name} onSearch={onSearch} />
            <KeyValue label="Value" value={m.value} />
            <KeyValue label="Count" value={m.count} />
            <KeyValue label="Min" value={m.min} />
            <KeyValue label="Max" value={m.max} />
            <KeyValue label="Std Dev" value={m.stdDev} />
          </div>
        ))}
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
    </>
  );
}

function PageviewDetail({ data, onSearch }: { data: PageviewData; onSearch?: (value: string) => void }) {
  return (
    <>
      <Section title="Page View">
        <KeyValue label="Name" value={data.name} onSearch={onSearch} />
        <KeyValue label="URL" value={data.url} onSearch={onSearch} />
        <KeyValue label="ID" value={data.id} onSearch={onSearch} />
        <KeyValue label="Duration" value={formatDuration(data.duration)} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements">
          <MeasurementsTable data={data.measurements} />
        </Section>
      )}
    </>
  );
}

function PageviewPerfDetail({
  data,
  onSearch,
}: {
  data: PageviewPerformanceData;
  onSearch?: (value: string) => void;
}) {
  return (
    <>
      <Section title="Page View Performance">
        <KeyValue label="Name" value={data.name} onSearch={onSearch} />
        <KeyValue label="URL" value={data.url} onSearch={onSearch} />
        <KeyValue label="Duration" value={formatDuration(data.duration)} />
        <KeyValue label="Total" value={formatDuration(data.perfTotal)} />
        <KeyValue label="Network Connect" value={formatDuration(data.networkConnect)} />
        <KeyValue label="Sent Request" value={formatDuration(data.sentRequest)} />
        <KeyValue label="Received Response" value={formatDuration(data.receivedResponse)} />
        <KeyValue label="DOM Processing" value={formatDuration(data.domProcessing)} />
      </Section>
      {data.properties && Object.keys(data.properties).length > 0 && (
        <Section title="Custom Properties">
          <PropsTable data={data.properties} onSearch={onSearch} />
        </Section>
      )}
      {data.measurements && Object.keys(data.measurements).length > 0 && (
        <Section title="Measurements">
          <MeasurementsTable data={data.measurements} />
        </Section>
      )}
    </>
  );
}

export default function TelemetryDetail({ item, onClose, onSearch, onFilterByOperation }: TelemetryDetailProps) {
  const [showRaw, setShowRaw] = useState(false);
  const envelope = item.envelope;
  const bd = envelope.data?.baseData;

  return (
    <div className="h-full flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
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

      <div className="flex-1 overflow-y-auto p-4">
        {showRaw ? (
          <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
            {JSON.stringify(envelope, null, 2)}
          </pre>
        ) : (
          <>
            <Section title="Envelope">
              <KeyValue label="Time" value={item.timestamp} />
              <KeyValue label="Type" value={item.type} />
              <KeyValue label="Envelope Name" value={envelope.name} onSearch={onSearch} />
              <KeyValue label="Base Type" value={envelope.data?.baseType} onSearch={onSearch} />
              <KeyValue label="iKey" value={envelope.iKey} onSearch={onSearch} />
              <KeyValue label="Sequence" value={envelope.seq} />
              <KeyValue label="Sample Rate" value={envelope.sampleRate} />
            </Section>

            {envelope.tags && Object.keys(envelope.tags).length > 0 && (
              <Section title="Tags">
                <TagsTable
                  data={envelope.tags}
                  onSearch={onSearch}
                  onFilterByOperation={onFilterByOperation}
                />
              </Section>
            )}

            {bd && item.type === 'Request' && <RequestDetail data={bd as RequestData} onSearch={onSearch} />}
            {bd && item.type === 'Dependency' && (
              <DependencyDetail data={bd as RemoteDependencyData} onSearch={onSearch} />
            )}
            {bd && item.type === 'Exception' && <ExceptionDetail data={bd as ExceptionData} onSearch={onSearch} />}
            {bd && item.type === 'Trace' && <TraceDetail data={bd as MessageData} onSearch={onSearch} />}
            {bd && item.type === 'Event' && <EventDetail data={bd as EventData} onSearch={onSearch} />}
            {bd && item.type === 'Metric' && <MetricDetail data={bd as MetricData} onSearch={onSearch} />}
            {bd && item.type === 'PageView' && <PageviewDetail data={bd as PageviewData} onSearch={onSearch} />}
            {bd && item.type === 'PageViewPerf' && (
              <PageviewPerfDetail data={bd as PageviewPerformanceData} onSearch={onSearch} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

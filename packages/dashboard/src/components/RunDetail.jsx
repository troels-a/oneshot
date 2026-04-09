import { useState, useEffect, useRef } from 'react';
import { fetchRun, fetchRunLogs, fetchLogContent, fetchLogTail } from '../api';
import { parseRuntimeLogLines } from '../runtime-log-renderers';

const LOG_LABELS = { 'stdout.log': 'Logs', 'stderr.log': 'Errors' };
const TAIL_INTERVAL = 3000;

export default function RunDetail({ runId, onBack }) {
  const [run, setRun] = useState(null);
  const [logFiles, setLogFiles] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [error, setError] = useState('');
  const lastLineRef = useRef(0);
  const timelineRef = useRef(null);

  async function loadAll(filename) {
    const data = await fetchLogContent(runId, filename);
    const parsed = parseRuntimeLogLines(data.lines, run?.runtime);
    setEntries(parsed);
    lastLineRef.current = data.offset + data.lines.length;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [runData, logsData] = await Promise.all([
          fetchRun(runId),
          fetchRunLogs(runId).catch(() => ({ files: [] })),
        ]);
        if (cancelled) return;
        setRun(runData);
        setLogFiles(logsData.files || []);

        if (logsData.files?.length && !selectedLog) {
          const first = logsData.files.find(f => f.name === 'stdout.log')?.name || logsData.files[0].name;
          setSelectedLog(first);
          lastLineRef.current = 0;
          await loadAll(first);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    const interval = setInterval(async () => {
      try {
        const runData = await fetchRun(runId);
        if (!cancelled) setRun(runData);
      } catch {}
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [runId]);

  // Poll for new log lines while run is active
  useEffect(() => {
    if (!run || run.status !== 'running' || !selectedLog) return;

    const interval = setInterval(async () => {
      try {
        const data = await fetchLogTail(runId, selectedLog, lastLineRef.current);
        if (data.lines.length > 0) {
          const newEntries = parseRuntimeLogLines(data.lines, run?.runtime);
          setEntries(prev => [...newEntries, ...prev]);
          lastLineRef.current = data.lastLine;
        }
      } catch {}
    }, TAIL_INTERVAL);

    return () => clearInterval(interval);
  }, [run?.status, selectedLog, runId]);

  async function selectLog(filename) {
    setSelectedLog(filename);
    setEntries([]);
    lastLineRef.current = 0;
    try {
      await loadAll(filename);
    } catch (err) {
      setEntries([{ type: 'error', label: 'error', summary: `Error: ${err.message}` }]);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!run) return <div className="loading">Loading...</div>;

  return (
    <div className="run-detail">
      <button className="btn btn-glass btn-sm" onClick={onBack}>Back</button>

      <div className="run-info">
        <h2>{run.agentName}</h2>
        <div className="run-meta">
          <div><strong>ID:</strong> <span className="mono">{run.id}</span></div>
          <div><strong>Status:</strong> <span className={`badge badge-${run.status}`}>{run.status}</span></div>
          <div><strong>Runtime:</strong> {run.runtime || run.entrypoint || '-'}</div>
          <div><strong>PID:</strong> {run.pid || '-'}</div>
          <div><strong>Started:</strong> {run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}</div>
          <div><strong>Completed:</strong> {run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</div>
          <div><strong>Exit Code:</strong> {run.exitCode ?? '-'}</div>
          {run.signal && <div><strong>Signal:</strong> {run.signal}</div>}
          {(run.cwd || run.options?.path) && (
            <div><strong>Path:</strong> <span className="mono">{run.cwd || run.options.path}</span></div>
          )}
          {run.worktree?.dir && (
            <div><strong>Worktree:</strong> <span className="mono">{run.worktree.dir}</span></div>
          )}
          {run.options?.branch && <div><strong>Branch:</strong> <span className="mono">{run.options.branch}</span></div>}
          {run.options?.timeout && <div><strong>Timeout:</strong> {run.options.timeout}s</div>}
        </div>
        {run.options?.args && Object.keys(run.options.args).length > 0 && (
          <dl className="run-args">
            {Object.entries(run.options.args).map(([key, value]) => (
              <div key={key} className="run-arg">
                <dt>{key}</dt>
                <dd className="mono">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {run.result && (
        <div className="glass-card" style={{marginBottom: 16}}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10}}>
            <h3 style={{margin: 0}}>Result</h3>
            {run.resultMeta && (
              <div style={{display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)'}}>
                {run.resultMeta.num_turns != null && <span>{run.resultMeta.num_turns} turns</span>}
                {run.resultMeta.duration_ms != null && <span>{(run.resultMeta.duration_ms / 1000).toFixed(1)}s</span>}
                {run.resultMeta.cost != null && <span>${run.resultMeta.cost.toFixed(4)}</span>}
              </div>
            )}
          </div>
          <pre className="run-result">{run.result}</pre>
        </div>
      )}

      <div className="log-section">
        <h3>Timeline</h3>
        {logFiles.length === 0 ? (
          <p className="empty">No log files available</p>
        ) : (
          <>
            {logFiles.length > 1 && (
              <div className="log-tabs">
                {logFiles.map((f) => (
                  <button
                    key={f.name}
                    className={`tab ${selectedLog === f.name ? 'tab-active' : ''}`}
                    onClick={() => selectLog(f.name)}
                  >
                    {LOG_LABELS[f.name] || f.name} <span className="log-size">({formatSize(f.size)})</span>
                  </button>
                ))}
              </div>
            )}
            <div className="timeline" ref={timelineRef}>
              {entries.length === 0 ? (
                <p className="empty">Empty log</p>
              ) : (
                entries.map((entry, i) => (
                  <TimelineEntry key={i} entry={entry} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);

  const typeClass = `type-${entry.type}`;
  const labelClass = `label-${entry.type}`;

  return (
    <div className={`timeline-entry ${typeClass}`}>
      <div>
        {entry.time && <span className="timeline-time">{entry.time}</span>}
        <span className={`timeline-label ${labelClass}`}>{entry.label}</span>
      </div>
      <div className="timeline-body">
        {entry.summary}
        {entry.cost != null && (
          <div className="timeline-cost">${entry.cost.toFixed(4)}</div>
        )}
        {entry.metadata?.length > 0 && (
          <div className="timeline-metadata">
            {entry.metadata.map((item, index) => (
              <span key={`${item}-${index}`} className="timeline-meta-chip">{item}</span>
            ))}
          </div>
        )}
      </div>
      {entry.detail && (
        <>
          <button className="timeline-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && <div className="timeline-detail">{entry.detail}</div>}
        </>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

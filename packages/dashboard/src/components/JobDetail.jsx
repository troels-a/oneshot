import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchJob, fetchJobLogs, fetchLogContent } from '../api';

const PAGE_SIZE = 50;

export default function JobDetail({ jobId, onBack }) {
  const [job, setJob] = useState(null);
  const [logFiles, setLogFiles] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const timelineRef = useRef(null);

  async function loadPage(filename, offset, append = false) {
    const data = await fetchLogContent(jobId, filename, { offset, limit: PAGE_SIZE });
    const parsed = parseLines(data.lines);
    if (append) {
      setEntries(prev => [...prev, ...parsed]);
    } else {
      setEntries(parsed);
    }
    offsetRef.current = offset + data.lines.length;
    setHasMore(data.hasMore);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [jobData, logsData] = await Promise.all([
          fetchJob(jobId),
          fetchJobLogs(jobId).catch(() => ({ files: [] })),
        ]);
        if (cancelled) return;
        setJob(jobData);
        setLogFiles(logsData.files || []);

        if (logsData.files?.length && !selectedLog) {
          const first = logsData.files[0].name;
          setSelectedLog(first);
          offsetRef.current = 0;
          await loadPage(first, 0);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    load();
    const interval = setInterval(async () => {
      try {
        const jobData = await fetchJob(jobId);
        if (!cancelled) setJob(jobData);
      } catch {}
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [jobId]);

  async function selectLog(filename) {
    setSelectedLog(filename);
    setEntries([]);
    offsetRef.current = 0;
    setHasMore(false);
    try {
      await loadPage(filename, 0);
    } catch (err) {
      setEntries([{ type: 'error', label: 'error', summary: `Error: ${err.message}` }]);
    }
  }

  const handleScroll = useCallback(async () => {
    const el = timelineRef.current;
    if (!el || loadingMore || !hasMore || !selectedLog) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setLoadingMore(true);
      try {
        await loadPage(selectedLog, offsetRef.current, true);
      } catch {}
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, selectedLog, jobId]);

  if (error) return <div className="error-box">{error}</div>;
  if (!job) return <div className="loading">Loading...</div>;

  return (
    <div className="job-detail">
      <button className="btn btn-sm" onClick={onBack}>Back</button>

      <div className="job-info">
        <h2>{job.agentName}</h2>
        <div className="job-meta">
          <div><strong>ID:</strong> <span className="mono">{job.id}</span></div>
          <div><strong>Status:</strong> <span className={`badge badge-${job.status}`}>{job.status}</span></div>
          <div><strong>Entrypoint:</strong> {job.entrypoint || '-'}</div>
          <div><strong>PID:</strong> {job.pid || '-'}</div>
          <div><strong>Started:</strong> {job.startedAt ? new Date(job.startedAt).toLocaleString() : '-'}</div>
          <div><strong>Completed:</strong> {job.completedAt ? new Date(job.completedAt).toLocaleString() : '-'}</div>
          <div><strong>Exit Code:</strong> {job.exitCode ?? '-'}</div>
          {job.signal && <div><strong>Signal:</strong> {job.signal}</div>}
        </div>
      </div>

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
                    {f.name} <span className="log-size">({formatSize(f.size)})</span>
                  </button>
                ))}
              </div>
            )}
            <div className="timeline" ref={timelineRef} onScroll={handleScroll}>
              {entries.length === 0 ? (
                <p className="empty">Empty log</p>
              ) : (
                entries.map((entry, i) => (
                  <TimelineEntry key={i} entry={entry} />
                ))
              )}
              {loadingMore && <div className="loading">Loading more...</div>}
              {hasMore && !loadingMore && (
                <div className="loading" style={{ padding: '12px', fontSize: '12px' }}>Scroll for more</div>
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

function parseLines(lines) {
  const entries = [];
  for (const line of lines) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      entries.push({ type: 'system', label: 'raw', summary: line });
      continue;
    }
    const entry = parseEntry(obj);
    if (!entry) continue;
    if (Array.isArray(entry)) entries.push(...entry);
    else entries.push(entry);
  }
  return entries;
}

function parseEntry(obj) {
  const type = obj.type;

  if (type === 'system' && obj.subtype === 'init') {
    return {
      type: 'system',
      label: 'init',
      summary: `Session started in ${obj.cwd || 'unknown'}`,
      detail: [
        `Model: ${obj.model || '?'}`,
        `Tools: ${obj.tools?.length || 0} loaded`,
        `MCP: ${obj.mcp_servers?.filter(s => s.status === 'connected').length || 0}/${obj.mcp_servers?.length || 0} connected`,
        `Plugins: ${obj.plugins?.map(p => p.name).join(', ') || 'none'}`,
      ].join('\n'),
    };
  }

  if (type === 'system' && obj.subtype === 'hook_started') {
    return {
      type: 'system',
      label: 'hook',
      summary: `Hook: ${obj.hook_name || obj.hook_event || 'unknown'}`,
    };
  }

  if (type === 'system' && obj.subtype === 'hook_response') {
    const ok = obj.exit_code === 0 || obj.outcome === 'success';
    return {
      type: ok ? 'system' : 'error',
      label: ok ? 'hook ok' : 'hook fail',
      summary: `${obj.hook_name || 'Hook'} ${ok ? 'completed' : 'failed'}`,
    };
  }

  if (type === 'assistant' && obj.message) {
    const msg = obj.message;
    const textParts = (msg.content || []).filter(c => c.type === 'text');
    const toolParts = (msg.content || []).filter(c => c.type === 'tool_use');
    const thinkParts = (msg.content || []).filter(c => c.type === 'thinking');

    const parts = [];

    if (thinkParts.length) {
      const thinking = thinkParts.map(t => t.thinking).join('\n');
      if (thinking.length > 0) {
        parts.push({ type: 'system', label: 'thinking', summary: truncate(thinking, 120), detail: thinking.length > 120 ? thinking : null });
      }
    }

    if (textParts.length) {
      const text = textParts.map(t => t.text).join('\n');
      parts.push({ type: 'assistant', label: 'response', summary: truncate(text, 200), detail: text.length > 200 ? text : null });
    }

    for (const tool of toolParts) {
      const input = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2);
      parts.push({
        type: 'tool',
        label: tool.name || 'tool',
        summary: describeToolUse(tool),
        detail: input,
      });
    }

    return parts.length === 1 ? parts[0] : parts.length > 1 ? parts : null;
  }

  if (type === 'result') {
    return {
      type: obj.is_error ? 'error' : 'result',
      label: obj.is_error ? 'error' : 'done',
      summary: truncate(obj.result || `Completed in ${obj.num_turns || '?'} turns`, 200),
      cost: obj.total_cost_usd,
      detail: obj.result && obj.result.length > 200 ? obj.result : null,
      time: obj.duration_ms ? `${(obj.duration_ms / 1000).toFixed(1)}s` : null,
    };
  }

  if (type === 'tool_result') {
    return {
      type: obj.is_error ? 'error' : 'system',
      label: obj.is_error ? 'error' : 'tool result',
      summary: truncate(typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content), 150),
      detail: typeof obj.content === 'string' && obj.content.length > 150 ? obj.content : null,
    };
  }

  if (type === 'rate_limit_event') return null;

  return {
    type: 'system',
    label: obj.subtype || type || '?',
    summary: truncate(JSON.stringify(obj), 100),
  };
}

function describeToolUse(tool) {
  const name = tool.name || 'unknown';
  const input = tool.input || {};

  if (name === 'Read') return `Read ${input.file_path || '?'}`;
  if (name === 'Write') return `Write ${input.file_path || '?'}`;
  if (name === 'Edit') return `Edit ${input.file_path || '?'}`;
  if (name === 'Bash') return `$ ${truncate(input.command || '?', 80)}`;
  if (name === 'Glob') return `Glob ${input.pattern || '?'}`;
  if (name === 'Grep') return `Grep "${truncate(input.pattern || '?', 40)}"`;
  if (name === 'WebFetch') return `Fetch ${input.url || '?'}`;
  if (name === 'WebSearch') return `Search "${input.query || '?'}"`;
  if (name === 'Task' || name === 'Agent') return `Spawn ${input.description || 'agent'}`;

  return name;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

import { useState, useEffect, useCallback } from 'react';
import { fetchAgents, fetchRuns, fetchSchedules, stopRun, clearRuns } from '../api';

const REFRESH_INTERVAL = 5000;
const PAGE_SIZE = 25;

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusBadge(status) {
  const icons = {
    running: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4" stroke="#8AADC0" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
    completed: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 6.5L5 8.5L9 3.5" stroke="#7DAF8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    failed: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="#C08080" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    pending: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4" stroke="#C0A878" strokeWidth="1.5" fill="none"/>
        <path d="M6 4V6.5L7.5 7.5" stroke="#C0A878" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  };
  const colors = {
    running: '#8AADC0',
    completed: '#7DAF8A',
    failed: '#C08080',
    pending: '#C0A878',
  };
  return (
    <span className="status-indicator">
      {icons[status]}
      <span style={{color: colors[status] || '#888'}}>{status}</span>
    </span>
  );
}

export default function Dashboard({ tab, onSelectRun, onSelectAgent }) {
  const [agents, setAgents] = useState([]);
  const [runs, setRuns] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [agentList, runList] = await Promise.all([
        fetchAgents(),
        fetchRuns({ status: statusFilter || undefined, agent: agentFilter || undefined }),
      ]);
      setAgents(agentList);
      setRuns(runList.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)));

      if (tab === 'schedules') {
        const results = await Promise.all(
          agentList.map((agent) =>
            fetchSchedules(agent.name)
              .then((s) => s.map((sch) => ({ ...sch, agent: agent.name })))
              .catch(() => [])
          )
        );
        setSchedules(results.flat());
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, agentFilter, tab]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleClear() {
    if (!window.confirm('Clear all completed and failed runs?')) return;
    try {
      await clearRuns();
      setPage(0);
      loadData();
    } catch (err) {
      console.error(err);
    }
  }

  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const clampedPage = Math.min(page, Math.max(0, totalPages - 1));
  if (clampedPage !== page) setPage(clampedPage);
  const start = clampedPage * PAGE_SIZE;
  const pagedRuns = runs.slice(start, start + PAGE_SIZE);
  const hasClearable = runs.some(r => r.status === 'completed' || r.status === 'failed');

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      {tab === 'runs' && (
        <div className="glass-card">
          <div className="section-header" style={{ marginBottom: 16 }}>
            <span className="section-title">Runs</span>
            <span className="section-badge">{runs.length} runs</span>
            {hasClearable && (
              <button className="btn-clear" onClick={handleClear}>Clear</button>
            )}
          </div>
          <div className="filters">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <select value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}>
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          {runs.length === 0 ? (
            <p className="empty">No runs found</p>
          ) : (
            <>
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRuns.map((run) => (
                    <tr key={run.id} className="clickable" onClick={() => onSelectRun(run.id)}>
                      <td style={{ fontWeight: 500 }}>{run.agentName}</td>
                      <td>{statusBadge(run.status)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{timeAgo(run.startedAt)}</td>
                      <td className="mono">{run.id.slice(0, 8)}</td>
                      <td>
                        {run.status === 'running' && (
                          <button
                            className="btn-kill"
                            onClick={(e) => {
                              e.stopPropagation();
                              stopRun(run.id).then(loadData).catch(console.error);
                            }}
                          >
                            Kill
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <button disabled={clampedPage === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
                  <span>{start + 1}–{Math.min(start + PAGE_SIZE, runs.length)} of {runs.length}</span>
                  <button disabled={clampedPage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'agents' && (
        <div>
          {agents.length === 0 ? (
            <p className="empty">No agents found</p>
          ) : (
            <div className="agent-grid">
              {agents.map((agent) => {
                const agentRuns = runs.filter((r) => r.agentName === agent.name);
                const running = agentRuns.filter((r) => r.status === 'running').length;
                return (
                  <div key={agent.name} className="agent-card" onClick={() => onSelectAgent(agent.name)} style={{cursor: 'pointer'}}>
                    <div className="agent-card-header">
                      <h3>{agent.name}</h3>
                      <span className="badge badge-runtime-hollow">{agent.runtime}</span>
                    </div>
                    <div className="agent-stats">
                      <span>{agentRuns.length} runs</span>
                      {running > 0 && <span className="badge badge-activity">{running} running</span>}
                    </div>
                  </div>
                );
              })}
              <div className="agent-card agent-card-new" onClick={() => onSelectAgent('__new__')}>
                <span className="new-agent-plus">+</span>
                <span>New Agent</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'schedules' && (
        <div className="glass-card">
          <div className="section-header" style={{ marginBottom: 16 }}>
            <span className="section-title">Schedules</span>
            <span className="section-badge">{schedules.length} total</span>
          </div>
          {schedules.length === 0 ? (
            <p className="empty">No schedules found</p>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Cron</th>
                  <th>Enabled</th>
                  <th>Last Run</th>
                  <th>Next Run</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.agent}</td>
                    <td className="mono">{s.cron}</td>
                    <td>{s.enabled ? 'Yes' : 'No'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{timeAgo(s.lastRunAt)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '-'}</td>
                    <td>{s.lastRunResult || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

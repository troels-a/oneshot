import { useState, useEffect, useCallback } from 'react';
import { fetchAgents, fetchRuns, fetchAllSchedules, clearRuns } from '../api';
import RunCard from './RunCard';
import ScheduleCard from './ScheduleCard';

const REFRESH_INTERVAL = 5000;
const PAGE_SIZE = 25;

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
        const allSchedules = await fetchAllSchedules();
        setSchedules(allSchedules);
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
        <div>
          <div className="filters" style={{ marginBottom: 16 }}>
            <span className="section-badge">{runs.length} runs</span>
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
            {hasClearable && (
              <button className="btn btn-sm btn-glass" onClick={handleClear}>Clear</button>
            )}
          </div>
          {runs.length === 0 ? (
            <p className="empty">No runs found</p>
          ) : (
            <>
              <div className="run-card-list">
                {pagedRuns.map((run) => (
                  <div key={run.id} className={`run-card-wrapper status-${run.status}`}>
                    <RunCard
                      run={run}
                      onClick={() => onSelectRun(run.id)}
                      onRefresh={loadData}
                    />
                  </div>
                ))}
              </div>
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
        <div>
          <div className="filters" style={{ marginBottom: 16 }}>
            <span className="section-badge">{schedules.length} schedules</span>
          </div>
          {schedules.length === 0 ? (
            <p className="empty">No schedules found</p>
          ) : (
            <div className="run-card-list">
              {schedules.map((s) => (
                <div key={s.id} className={`run-card-wrapper ${s.enabled ? 'status-completed' : ''}`}>
                  <ScheduleCard schedule={s} onUpdate={() => fetchAllSchedules().then(all => setSchedules(all))} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { fetchAgents, fetchJobs, fetchSchedules, stopJob } from '../api';

const REFRESH_INTERVAL = 5000;

export default function Dashboard({ onSelectJob }) {
  const [tab, setTab] = useState('jobs');
  const [agents, setAgents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [agentList, jobList] = await Promise.all([
        fetchAgents(),
        fetchJobs({ status: statusFilter || undefined, agent: agentFilter || undefined }),
      ]);
      setAgents(agentList);
      setJobs(jobList.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)));

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

  function statusBadge(status) {
    const cls = {
      running: 'badge-running',
      completed: 'badge-completed',
      failed: 'badge-failed',
      pending: 'badge-pending',
    }[status] || '';
    return <span className={`badge ${cls}`}>{status}</span>;
  }

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

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="dashboard">
      <nav className="tabs">
        {['jobs', 'agents', 'schedules'].map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'jobs' && <span className="tab-count">{jobs.length}</span>}
            {t === 'agents' && <span className="tab-count">{agents.length}</span>}
            {t === 'schedules' && <span className="tab-count">{schedules.length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'jobs' && (
        <div className="section">
          <div className="filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          </div>
          {jobs.length === 0 ? (
            <p className="empty">No jobs found</p>
          ) : (
            <table>
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
                {jobs.map((job) => (
                  <tr key={job.id} className="clickable" onClick={() => onSelectJob(job.id)}>
                    <td>{job.agentName}</td>
                    <td>{statusBadge(job.status)}</td>
                    <td>{timeAgo(job.startedAt)}</td>
                    <td className="mono">{job.id.slice(0, 8)}</td>
                    <td>
                      {job.status === 'running' && (
                        <button
                          className="btn-kill"
                          onClick={(e) => {
                            e.stopPropagation();
                            stopJob(job.id).then(loadData).catch(console.error);
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
          )}
        </div>
      )}

      {tab === 'agents' && (
        <div className="section">
          {agents.length === 0 ? (
            <p className="empty">No agents found</p>
          ) : (
            <div className="agent-grid">
              {agents.map((agent) => {
                const agentJobs = jobs.filter((j) => j.agentName === agent.name);
                const running = agentJobs.filter((j) => j.status === 'running').length;
                return (
                  <div key={agent.name} className="agent-card">
                    <div className="agent-card-header">
                      <h3>{agent.name}</h3>
                      <span className={`badge badge-type-${agent.entrypoint}`}>{agent.entrypoint}</span>
                    </div>
                    <div className="agent-stats">
                      <span>{agentJobs.length} jobs</span>
                      {running > 0 && <span className="badge badge-running">{running} running</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'schedules' && (
        <div className="section">
          {schedules.length === 0 ? (
            <p className="empty">No schedules found</p>
          ) : (
            <table>
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
                    <td>{s.agent}</td>
                    <td className="mono">{s.cron}</td>
                    <td>{s.enabled ? 'Yes' : 'No'}</td>
                    <td>{timeAgo(s.lastRunAt)}</td>
                    <td>{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '-'}</td>
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

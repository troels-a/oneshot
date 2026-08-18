import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAgents, fetchRuns, fetchStats, fetchAllSchedules, fetchAllWebhooks, clearRuns, createSchedule, createWebhook } from '../api';
import RunCard from './RunCard';
import ScheduleCard from './ScheduleCard';
import ScheduleForm from './ScheduleForm';
import WebhookCard from './WebhookCard';
import WebhookForm from './WebhookForm';

const REFRESH_INTERVAL = 5000;
const PAGE_SIZE = 25;

export default function Dashboard({ tab, onSelectRun, onSelectAgent }) {
  const [agents, setAgents] = useState([]);
  const [runs, setRuns] = useState([]);
  const [total, setTotal] = useState(0);
  const [clearableCount, setClearableCount] = useState(0);
  const [runsByAgent, setRunsByAgent] = useState({});
  const [schedules, setSchedules] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [webhooks, setWebhooks] = useState([]);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [createdWebhookUrl, setCreatedWebhookUrl] = useState('');

  // Paging and polling overlap: a slow request for the previous page must not
  // land after a newer one and paint stale rows under the new page label.
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [agentList, runPage, stats] = await Promise.all([
        fetchAgents(),
        fetchRuns({
          status: statusFilter || undefined,
          agent: agentFilter || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        fetchStats(),
      ]);
      if (id !== requestId.current) return;
      setAgents(agentList);
      // Rows arrive started_at DESC from SQL, already limited to this page.
      setRuns(runPage.runs);
      setTotal(runPage.total);
      // Counted server-side: the Clear button must reflect every clearable run,
      // not just the ones on the current page.
      setClearableCount(stats.completed + stats.failed + stats.timedOut);
      setRunsByAgent(stats.byAgent || {});

      if (tab === 'schedules') {
        const allSchedules = await fetchAllSchedules();
        if (id === requestId.current) setSchedules(allSchedules);
      }

      if (tab === 'webhooks') {
        const allWebhooks = await fetchAllWebhooks();
        if (id === requestId.current) setWebhooks(allWebhooks);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, agentFilter, tab, page]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleCreateSchedule({ agent, cron, enabled, options, name }) {
    setCreateSaving(true);
    setCreateError('');
    try {
      await createSchedule(agent, { cron, enabled, options, name });
      setCreatingSchedule(false);
      const allSchedules = await fetchAllSchedules();
      setSchedules(allSchedules);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleCreateWebhook({ agent, name, signingSecret, staticArgs }) {
    setWebhookSaving(true);
    setWebhookError('');
    try {
      const created = await createWebhook(agent, { name, signingSecret, staticArgs });
      const allWebhooks = await fetchAllWebhooks();
      setWebhooks(allWebhooks);
      setCreatedWebhookUrl(created.ingestUrl || `${window.location.origin}${created.ingestPath}`);
    } catch (err) {
      setWebhookError(err.message);
    } finally {
      setWebhookSaving(false);
    }
  }

  function closeWebhookCreate() {
    setCreatingWebhook(false);
    setWebhookError('');
    setCreatedWebhookUrl('');
  }

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

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const clampedPage = Math.min(page, Math.max(0, totalPages - 1));
  if (clampedPage !== page) setPage(clampedPage);
  const start = clampedPage * PAGE_SIZE;
  const pagedRuns = runs;
  const hasClearable = clearableCount > 0;

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      {tab === 'runs' && (
        <div>
          <div className="filters" style={{ marginBottom: 16 }}>
            <span className="section-badge">{total} runs</span>
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
          {total === 0 ? (
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
                  <span>{start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total}</span>
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
            <div className="empty">
              <p>No agents found</p>
              <button className="btn btn-glass" onClick={() => onSelectAgent('__new__')}>
                Create one now!
              </button>
            </div>
          ) : (
            <div className="agent-grid">
              {agents.map((agent) => {
                // Counted server-side: `runs` only holds the current page.
                const { total: agentRunCount = 0, running = 0 } = runsByAgent[agent.name] || {};
                return (
                  <div key={agent.name} className="agent-card" onClick={() => onSelectAgent(agent.name)} style={{cursor: 'pointer'}}>
                    <div className="agent-card-header">
                      <h3>{agent.name}</h3>
                      <span className="badge badge-runtime-hollow">{agent.runtime}</span>
                    </div>
                    <div className="agent-stats">
                      <span>{agentRunCount} runs</span>
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
            {!creatingSchedule && agents.length > 0 && (
              <button
                className="btn btn-sm btn-dark"
                onClick={() => { setCreateError(''); setCreatingSchedule(true); }}
              >
                + New Schedule
              </button>
            )}
          </div>
          {creatingSchedule && (
            <div style={{ marginBottom: 16 }}>
              <div className="run-card">
                <div className="run-card-header">
                  <div className="run-card-left">
                    <span className="run-card-agent">New schedule</span>
                  </div>
                </div>
                <ScheduleForm
                  mode="create"
                  agents={agents}
                  onSubmit={handleCreateSchedule}
                  onCancel={() => { setCreatingSchedule(false); setCreateError(''); }}
                  saving={createSaving}
                  error={createError}
                />
              </div>
            </div>
          )}
          {schedules.length === 0 && !creatingSchedule ? (
            <p className="empty">No schedules found</p>
          ) : (
            <div className="run-card-list run-card-list--plain">
              {schedules.map((s) => {
                const agentDef = agents.find(a => a.name === s.agent);
                return (
                  <div key={s.id} className="run-card-wrapper">
                    <ScheduleCard
                      schedule={s}
                      agentDef={agentDef}
                      onUpdate={() => fetchAllSchedules().then(all => setSchedules(all))}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'webhooks' && (
        <div>
          <div className="filters" style={{ marginBottom: 16 }}>
            <span className="section-badge">{webhooks.length} webhooks</span>
            {!creatingWebhook && agents.length > 0 && (
              <button
                className="btn btn-sm btn-dark"
                onClick={() => { setWebhookError(''); setCreatedWebhookUrl(''); setCreatingWebhook(true); }}
              >
                + New Webhook
              </button>
            )}
          </div>
          {creatingWebhook && (
            <div style={{ marginBottom: 16 }}>
              <div className="run-card">
                <div className="run-card-header">
                  <div className="run-card-left">
                    <span className="run-card-agent">New webhook</span>
                  </div>
                </div>
                <WebhookForm
                  mode="create"
                  agents={agents}
                  createdUrl={createdWebhookUrl}
                  onSubmit={handleCreateWebhook}
                  onCancel={closeWebhookCreate}
                  saving={webhookSaving}
                  error={webhookError}
                />
              </div>
            </div>
          )}
          {webhooks.length === 0 && !creatingWebhook ? (
            <p className="empty">No webhooks found</p>
          ) : (
            <div className="run-card-list run-card-list--plain">
              {webhooks.map((w) => (
                <div key={w.id} className="run-card-wrapper">
                  <WebhookCard
                    webhook={w}
                    agents={agents}
                    onUpdate={() => fetchAllWebhooks().then(all => setWebhooks(all))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { fetchRuns } from '../api';

const REFRESH_INTERVAL = 5000;

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatLatency(run) {
  if (!run.startedAt) return '-';
  const end = run.completedAt ? new Date(run.completedAt) : new Date();
  const secs = ((end - new Date(run.startedAt)) / 1000).toFixed(1);
  return `${secs}s`;
}

function statusLabel(status) {
  const map = {
    running: { label: 'Live', cls: 'badge-running' },
    completed: { label: 'Done', cls: 'badge-completed' },
    failed: { label: 'Failed', cls: 'badge-failed' },
    pending: { label: 'Pending', cls: 'badge-pending' },
  };
  const { label, cls } = map[status] || { label: status, cls: '' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Overview({ onSelectRun }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const runList = await fetchRuns({});
      setRuns(runList.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)));
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) return <div className="loading">Loading...</div>;

  const recentRuns = runs.slice(0, 50);

  return (
    <div className="glass-card">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="section-title-dot" />
          <span className="section-title">Live Runs Stream</span>
        </div>
        <span className="section-badge">Last {recentRuns.length || 50}</span>
      </div>

      {recentRuns.length === 0 ? (
        <p className="empty">No runs yet</p>
      ) : (
        <table className="glass-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Time</th>
              <th>Latency</th>
              <th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((run) => (
              <tr
                key={run.id}
                className="clickable"
                onClick={() => onSelectRun(run.id)}
              >
                <td style={{ fontWeight: 500 }}>{run.agentName}</td>
                <td style={{ color: 'var(--text-muted)' }}>{timeAgo(run.startedAt)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{formatLatency(run)}</td>
                <td style={{ textAlign: 'right' }}>{statusLabel(run.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

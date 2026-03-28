import { useState, useEffect, useCallback } from 'react';
import { fetchJobs } from '../api';

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

function formatLatency(job) {
  if (!job.startedAt) return '-';
  const end = job.completedAt ? new Date(job.completedAt) : new Date();
  const secs = ((end - new Date(job.startedAt)) / 1000).toFixed(1);
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

export default function Overview({ onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const jobList = await fetchJobs({});
      setJobs(jobList.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)));
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

  const recentJobs = jobs.slice(0, 50);

  return (
    <div className="glass-card">
      <div className="section-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="section-title-dot" />
          <span className="section-title">Live Jobs Stream</span>
        </div>
        <span className="section-badge">Last {recentJobs.length || 50}</span>
      </div>

      {recentJobs.length === 0 ? (
        <p className="empty">No jobs yet</p>
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
            {recentJobs.map((job) => (
              <tr
                key={job.id}
                className="clickable"
                onClick={() => onSelectJob(job.id)}
              >
                <td style={{ fontWeight: 500 }}>{job.agentName}</td>
                <td style={{ color: 'var(--text-muted)' }}>{timeAgo(job.startedAt)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{formatLatency(job)}</td>
                <td style={{ textAlign: 'right' }}>{statusLabel(job.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

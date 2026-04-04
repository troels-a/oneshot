import { stopRun } from '../api';

function formatDuration(run) {
  const start = run.startedAt ? new Date(run.startedAt) : null;
  if (!start) return null;
  const end = run.completedAt ? new Date(run.completedAt) : new Date();
  const totalSecs = Math.floor((end - start) / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  let time;
  if (days > 0) time = `${days}d ${hours}h`;
  else if (hours > 0) time = `${hours}h ${mins}m`;
  else if (mins > 0) time = `${mins}m ${secs}s`;
  else time = `${secs}s`;
  return run.status === 'running' ? `${time} elapsed` : `${time} total`;
}

const statusColors = {
  running: 'var(--blue)',
  completed: 'var(--green)',
  failed: 'var(--red)',
  pending: 'var(--yellow)',
};

const statusBgColors = {
  running: 'var(--blue-bg)',
  completed: 'var(--green-bg)',
  failed: 'var(--red-bg)',
  pending: 'var(--yellow-bg)',
};

export default function RunCard({ run, onClick, onRefresh }) {
  const duration = formatDuration(run);
  const color = statusColors[run.status] || 'var(--text-muted)';
  const bgColor = statusBgColors[run.status] || 'transparent';
  const source = run.source === 'schedule' ? 'Scheduled' : run.source === 'cli' ? 'CLI' : 'API';

  return (
    <div className="run-card" onClick={onClick}>
      <div className="run-card-header">
        <div className="run-card-left">
          <span className="run-card-agent">{run.agentName}</span>
          <span className="run-card-status" style={{ color, background: bgColor }}>
            <span className="run-card-dot" style={{ background: color }} />
            {run.status}
          </span>
        </div>
        <div className="run-card-right">
          <span className="run-card-id">{run.id.slice(0, 8)}</span>
          {duration && <span className="run-card-duration">{duration}</span>}
        </div>
      </div>
      <div className="run-card-divider" />
      <div className="run-card-footer">
        <div className="run-card-trigger">
          <span className="run-card-trigger-label">Trigger</span>
          <span className="run-card-trigger-value">{source}</span>
        </div>
        <div className="run-card-actions">
          <button className="btn btn-sm btn-glass" onClick={(e) => { e.stopPropagation(); onClick(); }}>
            View logs
          </button>
          {run.status === 'running' && (
            <button
              className="btn btn-sm btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                stopRun(run.id).then(onRefresh).catch(console.error);
              }}
            >
              Kill run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

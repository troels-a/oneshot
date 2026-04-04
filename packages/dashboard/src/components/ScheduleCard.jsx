import NaturalCron from './NaturalCron';

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

export default function ScheduleCard({ schedule }) {
  return (
    <div className="run-card">
      <div className="run-card-header">
        <div className="run-card-left">
          <span className="run-card-agent">{schedule.agent}</span>
          <span className="run-card-status" style={{
            color: schedule.enabled ? 'var(--green)' : 'var(--text-muted)',
            background: schedule.enabled ? 'var(--green-bg)' : 'rgba(0,0,0,0.04)',
          }}>
            <span className="run-card-dot" style={{
              background: schedule.enabled ? 'var(--green)' : 'var(--text-muted)',
            }} />
            {schedule.enabled ? 'active' : 'paused'}
          </span>
        </div>
        <div className="run-card-right">
          <NaturalCron expression={schedule.cron} />
        </div>
      </div>
      <div className="run-card-divider" />
      <div className="run-card-footer">
        <div className="run-card-trigger">
          <span className="run-card-trigger-label">Last run</span>
          <span className="run-card-trigger-value">{timeAgo(schedule.lastRunAt)}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {schedule.nextRunAt && (
            <div className="run-card-trigger">
              <span className="run-card-trigger-label">Next</span>
              <span className="run-card-trigger-value">{new Date(schedule.nextRunAt).toLocaleString()}</span>
            </div>
          )}
          {schedule.lastRunResult && (
            <span className={`badge badge-${schedule.lastRunResult}`}>{schedule.lastRunResult}</span>
          )}
        </div>
      </div>
    </div>
  );
}

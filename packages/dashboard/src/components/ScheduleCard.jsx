import { useState, useEffect } from 'react';
import NaturalCron from './NaturalCron';
import ScheduleForm from './ScheduleForm';
import { updateSchedule, deleteSchedule } from '../api';

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

export default function ScheduleCard({ schedule, agentDef, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) setError('');
  }, [editing]);

  function handleToggleEdit() {
    if (saving) return;
    setEditing((prev) => !prev);
    setError('');
  }

  async function handleSave({ cron, enabled, options, name }) {
    setSaving(true);
    setError('');
    try {
      await updateSchedule(schedule.agent, schedule.id, { cron, enabled, options, name });
      setEditing(false);
      onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this schedule?')) return;
    setSaving(true);
    setError('');
    try {
      await deleteSchedule(schedule.agent, schedule.id);
      onUpdate();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="run-card">
      <div className="run-card-header" onClick={handleToggleEdit} style={{ cursor: 'pointer' }}>
        <div className="run-card-left">
          {schedule.name ? (
            <span className="run-card-agent" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span>{schedule.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)' }}>
                {schedule.agent}
              </span>
            </span>
          ) : (
            <span className="run-card-agent">{schedule.agent}</span>
          )}
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
      {editing && (
        <ScheduleForm
          mode="edit"
          agents={agentDef ? [agentDef] : []}
          agentName={schedule.agent}
          initial={{ cron: schedule.cron, enabled: schedule.enabled, options: schedule.options, name: schedule.name }}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          onDelete={handleDelete}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

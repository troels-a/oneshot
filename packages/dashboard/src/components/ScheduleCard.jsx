import { useState } from 'react';
import NaturalCron from './NaturalCron';
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

export default function ScheduleCard({ schedule, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [cron, setCron] = useState(schedule.cron);
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleToggleEdit() {
    if (saving) return;
    if (editing) {
      setCron(schedule.cron);
      setEnabled(schedule.enabled);
      setError('');
    }
    setEditing(!editing);
  }

  async function handleSave(e) {
    e.stopPropagation();
    setSaving(true);
    setError('');
    try {
      await updateSchedule(schedule.agent, schedule.id, { cron, enabled });
      setEditing(false);
      onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e) {
    e.stopPropagation();
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

  function handleCancel(e) {
    e.stopPropagation();
    setCron(schedule.cron);
    setEnabled(schedule.enabled);
    setError('');
    setEditing(false);
  }

  return (
    <div className="run-card">
      <div className="run-card-header" onClick={handleToggleEdit} style={{ cursor: 'pointer' }}>
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
      {editing && (
        <div className="schedule-edit-form">
          <div className="schedule-edit-field">
            <label className="schedule-edit-label">Cron expression</label>
            <input
              type="text"
              className="schedule-edit-input"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              disabled={saving}
            />
            <div className="schedule-edit-preview">
              <NaturalCron expression={cron} />
            </div>
          </div>
          <div className="schedule-edit-field">
            <label className="schedule-edit-label schedule-toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={saving}
              />
              <span>Enabled</span>
            </label>
          </div>
          {error && <div className="schedule-edit-error">{error}</div>}
          <div className="schedule-edit-actions">
            <button className="btn btn-dark btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-glass btn-sm" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-glass btn-sm" style={{ color: 'var(--red)' }} onClick={handleDelete} disabled={saving}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

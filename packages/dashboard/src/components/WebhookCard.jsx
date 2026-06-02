import { useState, useEffect } from 'react';
import WebhookForm from './WebhookForm';
import { updateWebhook, deleteWebhook } from '../api';

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ingestUrl(webhook) {
  // Prefer the full URL the server built from ONESHOT_PUBLIC_URL; fall back to
  // the page origin for same-origin deployments where it isn't configured.
  if (webhook.ingestUrl) return webhook.ingestUrl;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${webhook.ingestPath}`;
}

export default function WebhookCard({ webhook, agents, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editing) setError('');
  }, [editing]);

  function handleToggleEdit() {
    if (saving) return;
    setEditing((prev) => !prev);
    setError('');
  }

  async function handleCopy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ingestUrl(webhook));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function handleSave(payload) {
    setSaving(true);
    setError('');
    try {
      const { name, enabled, signingSecret, staticArgs } = payload;
      const body = { name, enabled, staticArgs };
      if (signingSecret !== undefined) body.signingSecret = signingSecret;
      await updateWebhook(webhook.agent, webhook.id, body);
      setEditing(false);
      onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this webhook? The ingest URL will stop working.')) return;
    setSaving(true);
    setError('');
    try {
      await deleteWebhook(webhook.agent, webhook.id);
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
          {webhook.name ? (
            <span className="run-card-agent" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span>{webhook.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)' }}>
                {webhook.agent}
              </span>
            </span>
          ) : (
            <span className="run-card-agent">{webhook.agent}</span>
          )}
          <span className="run-card-status" style={{
            color: webhook.enabled ? 'var(--green)' : 'var(--text-muted)',
            background: webhook.enabled ? 'var(--green-bg)' : 'rgba(0,0,0,0.04)',
          }}>
            <span className="run-card-dot" style={{
              background: webhook.enabled ? 'var(--green)' : 'var(--text-muted)',
            }} />
            {webhook.enabled ? 'active' : 'disabled'}
          </span>
          {webhook.hasSigningSecret && (
            <span className="badge badge-runtime-hollow" title="HMAC signature verification enabled">signed</span>
          )}
        </div>
        <div className="run-card-right">
          <span className="run-card-trigger-label">Last triggered</span>
          <span className="run-card-trigger-value">{timeAgo(webhook.lastTriggeredAt)}</span>
        </div>
      </div>
      <div className="run-card-divider" />
      <div className="run-card-footer">
        <code
          className="mono"
          style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={ingestUrl(webhook)}
        >
          {ingestUrl(webhook)}
        </code>
        <button className="btn btn-glass btn-sm" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy URL'}
        </button>
      </div>
      {editing && (
        <WebhookForm
          mode="edit"
          agents={agents}
          agentName={webhook.agent}
          initial={webhook}
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

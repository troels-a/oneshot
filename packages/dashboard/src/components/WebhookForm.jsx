import { useState } from 'react';

function CopyableUrl({ url }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="schedule-edit-field">
      <label className="schedule-edit-label">Ingest URL</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="text" className="schedule-edit-input mono" value={url} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-glass btn-sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function WebhookForm({
  mode,
  agents,
  agentName,
  initial,
  createdUrl,
  onSubmit,
  onCancel,
  onDelete,
  saving,
  error,
}) {
  const isCreate = mode === 'create';
  const [selectedAgent, setSelectedAgent] = useState(
    agentName || (isCreate && agents && agents[0] ? agents[0].name : '')
  );
  const [name, setName] = useState(initial?.name || '');
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [signingSecret, setSigningSecret] = useState('');
  const [clearSecret, setClearSecret] = useState(false);
  const [staticArgsText, setStaticArgsText] = useState(
    initial?.staticArgs && Object.keys(initial.staticArgs).length
      ? JSON.stringify(initial.staticArgs, null, 2)
      : ''
  );
  const [localError, setLocalError] = useState('');

  const hasSecret = !!initial?.hasSigningSecret;

  function handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    setLocalError('');

    if (isCreate && !selectedAgent) {
      setLocalError('Pick an agent');
      return;
    }

    let staticArgs;
    if (staticArgsText.trim()) {
      try {
        staticArgs = JSON.parse(staticArgsText);
      } catch {
        setLocalError('Static args must be valid JSON');
        return;
      }
      if (staticArgs === null || typeof staticArgs !== 'object' || Array.isArray(staticArgs)) {
        setLocalError('Static args must be a JSON object');
        return;
      }
    } else {
      staticArgs = {};
    }

    const trimmedName = name.trim();
    const payload = { name: trimmedName || null, staticArgs };

    if (isCreate) {
      payload.agent = selectedAgent;
      if (signingSecret) payload.signingSecret = signingSecret;
    } else {
      payload.enabled = enabled;
      if (clearSecret) payload.signingSecret = '';
      else if (signingSecret) payload.signingSecret = signingSecret;
    }

    onSubmit(payload);
  }

  const displayError = error || localError;

  return (
    <form className="schedule-edit-form" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
      {createdUrl && <CopyableUrl url={createdUrl} />}

      <div className="schedule-edit-field">
        <label className="schedule-edit-label">Name</label>
        <input
          type="text"
          className="schedule-edit-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="optional — defaults to agent name"
          maxLength={200}
          disabled={saving}
        />
      </div>

      {isCreate && (
        <div className="schedule-edit-field">
          <label className="schedule-edit-label">Agent</label>
          <select
            className="schedule-edit-input"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            disabled={saving}
          >
            {(agents || []).map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="schedule-edit-field">
        <label className="schedule-edit-label">
          Signing secret {hasSecret && !isCreate ? '(set)' : ''}
        </label>
        <input
          type="password"
          className="schedule-edit-input"
          value={signingSecret}
          onChange={(e) => setSigningSecret(e.target.value)}
          placeholder={
            isCreate
              ? 'optional — enables HMAC verification (Vercel)'
              : hasSecret ? 'leave blank to keep current' : 'optional — set to enable HMAC'
          }
          disabled={saving || (!isCreate && clearSecret)}
          autoComplete="new-password"
        />
        {!isCreate && hasSecret && (
          <label className="schedule-edit-label schedule-toggle" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={clearSecret}
              onChange={(e) => setClearSecret(e.target.checked)}
              disabled={saving}
            />
            <span>Clear secret (disable HMAC)</span>
          </label>
        )}
      </div>

      <div className="schedule-edit-field">
        <label className="schedule-edit-label">Static args (JSON object)</label>
        <textarea
          className="schedule-edit-input mono"
          rows={4}
          value={staticArgsText}
          onChange={(e) => setStaticArgsText(e.target.value)}
          placeholder={'{\n  "channel": "ops"\n}'}
          disabled={saving}
        />
        <div className="schedule-edit-preview">Merged into the dispatched args alongside `event` and `payload`.</div>
      </div>

      {!isCreate && (
        <div className="schedule-edit-field">
          <label className="schedule-edit-label schedule-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saving}
            />
            <span>Enabled</span>
          </label>
        </div>
      )}

      {displayError && <div className="schedule-edit-error">{displayError}</div>}

      <div className="schedule-edit-actions">
        <button type="submit" className="btn btn-dark btn-sm" disabled={saving}>
          {saving ? 'Saving...' : isCreate ? 'Create' : 'Save'}
        </button>
        <button type="button" className="btn btn-glass btn-sm" onClick={onCancel} disabled={saving}>
          {createdUrl ? 'Done' : 'Cancel'}
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn btn-glass btn-sm"
            style={{ color: 'var(--red)' }}
            onClick={onDelete}
            disabled={saving}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

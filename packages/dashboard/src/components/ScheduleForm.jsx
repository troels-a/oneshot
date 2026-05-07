import { useState, useMemo } from 'react';
import NaturalCron from './NaturalCron';

function buildInitialDefinedArgs(agentArgs, options) {
  const provided = (options && options.args) || {};
  const result = {};
  for (const arg of agentArgs || []) {
    const value = provided[arg.name];
    result[arg.name] = value === undefined || value === null ? '' : String(value);
  }
  return result;
}

function buildInitialExtraRows(agentArgs, options) {
  const provided = (options && options.args) || {};
  const definedNames = new Set((agentArgs || []).map((a) => a.name));
  const rows = [];
  for (const [key, value] of Object.entries(provided)) {
    if (definedNames.has(key)) continue;
    rows.push({ name: key, value: value === undefined || value === null ? '' : String(value) });
  }
  return rows;
}

function rowsToArgs(definedArgs, extraRows) {
  const args = {};
  for (const [name, value] of Object.entries(definedArgs)) {
    if (value === '' || value === undefined) continue;
    args[name] = value;
  }
  for (const row of extraRows) {
    const name = row.name.trim();
    if (!name) continue;
    if (row.value === '' || row.value === undefined) continue;
    args[name] = row.value;
  }
  return args;
}

function buildOptions(definedArgs, extraRows, path, branch, timeout) {
  const args = rowsToArgs(definedArgs, extraRows);
  const options = {};
  if (Object.keys(args).length) options.args = args;
  if (path.trim()) options.path = path.trim();
  if (branch.trim()) options.branch = branch.trim();
  if (timeout.trim()) {
    const n = Number(timeout);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    options.timeout = n;
  }
  return options;
}

export default function ScheduleForm({
  mode,
  agents,
  agentName,
  initial,
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
  const [cron, setCron] = useState(initial?.cron || '0 9 * * *');
  const [enabled, setEnabled] = useState(initial?.enabled !== false);

  const agentDef = useMemo(
    () => (agents || []).find((a) => a.name === selectedAgent),
    [agents, selectedAgent]
  );
  const agentArgs = agentDef?.args || [];

  const [definedArgs, setDefinedArgs] = useState(() =>
    buildInitialDefinedArgs(agentArgs, initial?.options)
  );
  const [extraRows, setExtraRows] = useState(() =>
    buildInitialExtraRows(agentArgs, initial?.options)
  );
  const [path, setPath] = useState(initial?.options?.path || '');
  const [branch, setBranch] = useState(initial?.options?.branch || '');
  const [timeout, setTimeout] = useState(
    initial?.options?.timeout !== undefined ? String(initial.options.timeout) : ''
  );
  const [localError, setLocalError] = useState('');

  function handleAgentChange(name) {
    setSelectedAgent(name);
    const next = (agents || []).find((a) => a.name === name);
    setDefinedArgs(buildInitialDefinedArgs(next?.args || [], null));
    setExtraRows(buildInitialExtraRows(next?.args || [], null));
  }

  function updateDefinedArg(name, value) {
    setDefinedArgs((prev) => ({ ...prev, [name]: value }));
  }

  function updateExtraRow(index, field, value) {
    setExtraRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addExtraRow() {
    setExtraRows((prev) => [...prev, { name: '', value: '' }]);
  }

  function removeExtraRow(index) {
    setExtraRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    setLocalError('');
    if (isCreate && !selectedAgent) {
      setLocalError('Pick an agent');
      return;
    }
    const missing = agentArgs
      .filter((arg) => arg.required)
      .filter((arg) => {
        const value = definedArgs[arg.name];
        if (value !== undefined && value !== '') return false;
        return arg.default === undefined || arg.default === '';
      })
      .map((arg) => arg.name);
    if (missing.length) {
      setLocalError(`Missing required argument${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
      return;
    }
    let options;
    try {
      options = buildOptions(definedArgs, extraRows, path, branch, timeout);
    } catch (err) {
      setLocalError(err.message);
      return;
    }
    const trimmedName = name.trim();
    const payload = { cron, enabled, options, name: trimmedName || null };
    if (isCreate) payload.agent = selectedAgent;
    onSubmit(payload);
  }

  const displayError = error || localError;

  return (
    <form className="schedule-edit-form" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
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
            onChange={(e) => handleAgentChange(e.target.value)}
            disabled={saving}
          >
            {(agents || []).map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="schedule-edit-field">
        <label className="schedule-edit-label">Cron expression</label>
        <input
          type="text"
          className="schedule-edit-input"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          disabled={saving}
        />
        <div className="schedule-edit-preview">
          <NaturalCron expression={cron} />
        </div>
      </div>

      <div className="schedule-edit-field">
        <div className="schedule-args-header">
          <span className="schedule-edit-label" style={{ margin: 0 }}>Arguments</span>
          <button type="button" className="editor-card-action" onClick={addExtraRow} disabled={saving}>
            + Add custom
          </button>
        </div>
        {agentArgs.length === 0 && extraRows.length === 0 ? (
          <div className="schedule-edit-preview">This agent takes no arguments</div>
        ) : (
          <div className="schedule-args-list">
            {agentArgs.map((arg) => (
              <div key={arg.name} className="schedule-arg-row">
                <div className="schedule-arg-row-top">
                  <span className="schedule-arg-name-static mono">{arg.name}</span>
                  <input
                    type="text"
                    className="schedule-edit-input schedule-arg-value"
                    placeholder={
                      arg.default !== undefined && arg.default !== ''
                        ? `default: ${arg.default}`
                        : arg.required ? 'required' : 'value'
                    }
                    value={definedArgs[arg.name] ?? ''}
                    onChange={(e) => updateDefinedArg(arg.name, e.target.value)}
                    disabled={saving}
                  />
                  <span className={arg.required ? 'badge-required' : 'badge-optional'}>
                    {arg.required ? 'required' : 'optional'}
                  </span>
                </div>
                {arg.description && arg.description !== arg.name && (
                  <div className="schedule-edit-preview">{arg.description}</div>
                )}
              </div>
            ))}
            {extraRows.map((row, i) => (
              <div key={`extra-${i}`} className="schedule-arg-row">
                <div className="schedule-arg-row-top">
                  <input
                    type="text"
                    className="schedule-edit-input mono schedule-arg-name"
                    placeholder="arg_name"
                    value={row.name}
                    onChange={(e) => updateExtraRow(i, 'name', e.target.value)}
                    disabled={saving}
                  />
                  <input
                    type="text"
                    className="schedule-edit-input schedule-arg-value"
                    placeholder="value"
                    value={row.value}
                    onChange={(e) => updateExtraRow(i, 'value', e.target.value)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="editor-item-remove"
                    onClick={() => removeExtraRow(i)}
                    disabled={saving}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <details>
        <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          Advanced options
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <div className="schedule-edit-field">
            <label className="schedule-edit-label">Path</label>
            <input
              type="text"
              className="schedule-edit-input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="optional working directory"
              disabled={saving}
            />
          </div>
          <div className="schedule-edit-field">
            <label className="schedule-edit-label">Branch</label>
            <input
              type="text"
              className="schedule-edit-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="optional git branch"
              disabled={saving}
            />
          </div>
          <div className="schedule-edit-field">
            <label className="schedule-edit-label">Timeout (seconds)</label>
            <input
              type="text"
              className="schedule-edit-input"
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
              placeholder="default: 1200"
              disabled={saving}
            />
          </div>
        </div>
      </details>

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

      {displayError && <div className="schedule-edit-error">{displayError}</div>}

      <div className="schedule-edit-actions">
        <button type="submit" className="btn btn-dark btn-sm" disabled={saving}>
          {saving ? 'Saving...' : isCreate ? 'Create' : 'Save'}
        </button>
        <button type="button" className="btn btn-glass btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
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

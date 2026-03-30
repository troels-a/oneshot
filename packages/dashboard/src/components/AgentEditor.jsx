import { useState, useEffect, useRef } from 'react';
import { fetchAgent, createAgent, updateAgent, deleteAgent, fetchAgentFiles, createAgentFile, uploadAgentFile, deleteAgentFile } from '../api';

const EDITOR_LABELS = {
  claude: { title: 'Prompt', hint: "Supports {{ args.* }} and {{ commands.* }} templates", placeholder: 'Enter the agent prompt...' },
  node: { title: 'Script', hint: 'Node.js — args passed as --key value flags via process.argv', placeholder: '// Your Node.js script here...\nconst args = process.argv.slice(2);\nconsole.log(args);\n' },
  bash: { title: 'Script', hint: 'Bash — args passed as --key value flags', placeholder: '#!/usr/bin/env bash\n# Your script here\necho "args: $@"\n' },
};

export default function AgentEditor({ agentName, onBack }) {
  const isNew = !agentName;
  const fileInputRef = useRef(null);

  // Form state
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState('claude');
  const [args, setArgs] = useState([]);
  const [commands, setCommands] = useState([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  // Load existing agent
  useEffect(() => {
    if (!isNew) {
      Promise.all([fetchAgent(agentName), fetchAgentFiles(agentName)])
        .then(([agent, filesData]) => {
          setName(agentName);
          setRuntime(agent.runtime);
          setArgs(agent.args || []);
          setCommands(agent.commands || []);
          setBody(agent.body || '');
          setFiles(filesData.files || []);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [agentName]);

  // Dirty guard
  useEffect(() => {
    const handler = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function change(setter) {
    return (val) => { setter(val); setDirty(true); };
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const data = { runtime, args, commands, body };
      if (isNew) {
        await createAgent({ name, ...data });
      } else {
        await updateAgent(agentName, data);
      }
      setDirty(false);
      if (isNew) onBack();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function handleDiscard() {
    if (isNew) { onBack(); return; }
    setLoading(true);
    Promise.all([fetchAgent(agentName), fetchAgentFiles(agentName)])
      .then(([agent, filesData]) => {
        setRuntime(agent.runtime);
        setArgs(agent.args || []);
        setCommands(agent.commands || []);
        setBody(agent.body || '');
        setFiles(filesData.files || []);
        setDirty(false);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function handleDelete() {
    if (!window.confirm(`Delete agent "${agentName}"? This cannot be undone.`)) return;
    try { await deleteAgent(agentName); onBack(); }
    catch (err) { setError(err.message); }
  }

  // Arg helpers
  function addArg() { change(setArgs)([...args, { name: '', description: '', required: false, default: '' }]); }
  function removeArg(i) { change(setArgs)(args.filter((_, j) => j !== i)); }
  function updateArg(i, field, value) {
    change(setArgs)(args.map((a, j) => j === i ? { ...a, [field]: value } : a));
  }

  // Command helpers
  function addCommand() { change(setCommands)([...commands, { name: '', run: '' }]); }
  function removeCommand(i) { change(setCommands)(commands.filter((_, j) => j !== i)); }
  function updateCommand(i, field, value) {
    change(setCommands)(commands.map((c, j) => j === i ? { ...c, [field]: value } : c));
  }

  // File helpers
  async function handleFileUpload(fileList) {
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        await uploadAgentFile(agentName || name, fd);
        const filesData = await fetchAgentFiles(agentName || name);
        setFiles(filesData.files || []);
      } catch (err) { setError(err.message); }
    }
  }

  async function handleNewFile() {
    const fileName = window.prompt('File name:');
    if (!fileName) return;
    try {
      await createAgentFile(agentName || name, fileName, '');
      const filesData = await fetchAgentFiles(agentName || name);
      setFiles(filesData.files || []);
    } catch (err) { setError(err.message); }
  }

  async function handleDeleteFile(fileName) {
    if (!window.confirm(`Delete ${fileName}?`)) return;
    try {
      await deleteAgentFile(agentName || name, fileName);
      setFiles(files.filter(f => f.name !== fileName));
    } catch (err) { setError(err.message); }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  if (loading) return <div className="loading">Loading...</div>;

  const editorLabel = EDITOR_LABELS[runtime] || EDITOR_LABELS.claude;

  return (
    <div>
      {/* Header */}
      <div className="agent-editor-header">
        <button className="agent-editor-back" onClick={() => { if (!dirty || window.confirm('You have unsaved changes. Discard?')) onBack(); }}>&#8592; Agents</button>
        <span className="agent-editor-sep">/</span>
        <span className="agent-editor-name">{isNew ? 'New Agent' : name}</span>
        {!isNew && <span className="badge badge-runtime-hollow">{runtime}</span>}
        {!isNew && (
          <button className="btn btn-sm" style={{marginLeft: 'auto', color: 'var(--red)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)'}} onClick={handleDelete}>Delete Agent</button>
        )}
      </div>

      {error && <div className="error-banner" style={{background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius-xs)', marginBottom: 16, fontSize: 13}}>{error}</div>}

      <div className="agent-editor-layout">
        {/* Left column */}
        <div className="agent-editor-left">
          {isNew && (
            <div className="glass-card">
              <div className="editor-card-header">
                <span className="editor-card-title">Name</span>
              </div>
              <input className="agent-name-input" placeholder="my-agent" value={name} onChange={e => { setName(e.target.value); setDirty(true); }} />
            </div>
          )}

          <div className="glass-card">
            <div className="editor-card-header">
              <span className="editor-card-title">Runtime</span>
            </div>
            <div className="runtime-toggle">
              {['claude', 'node', 'bash'].map(r => (
                <button key={r} className={`runtime-option ${runtime === r ? 'active' : ''}`} onClick={() => { setRuntime(r); setDirty(true); }}>{r}</button>
              ))}
            </div>
          </div>

          <div className="glass-card">
            <div className="editor-card-header">
              <span className="editor-card-title">Arguments</span>
              <button className="editor-card-action" onClick={addArg}>+ Add</button>
            </div>
            {args.map((arg, i) => (
              <div key={i} className="editor-item">
                <div className="editor-item-header">
                  <div style={{display:'flex', alignItems:'center', gap: 8}}>
                    <input className="editor-item-name mono" placeholder="arg_name" value={arg.name} onChange={e => updateArg(i, 'name', e.target.value)} style={{border:'none',background:'none',padding:0,fontFamily:'var(--font-mono)',fontSize:13,fontWeight:500}} />
                    <span className={arg.required ? 'badge-required' : 'badge-optional'} onClick={() => updateArg(i, 'required', !arg.required)} style={{cursor:'pointer'}}>
                      {arg.required ? 'required' : 'optional'}
                    </span>
                  </div>
                  <button className="editor-item-remove" onClick={() => removeArg(i)}>&#10005;</button>
                </div>
                <div className="editor-item-fields">
                  <div className="editor-field">
                    <label>Description</label>
                    <input value={arg.description || ''} onChange={e => updateArg(i, 'description', e.target.value)} />
                  </div>
                  <div className="editor-field editor-field-sm">
                    <label>Default</label>
                    <input className="mono" value={arg.default || ''} onChange={e => updateArg(i, 'default', e.target.value)} placeholder="—" />
                  </div>
                </div>
              </div>
            ))}
            {args.length === 0 && <div style={{color: '#aaa', fontSize: 12}}>No arguments defined</div>}
          </div>

          <div className="glass-card">
            <div className="editor-card-header">
              <span className="editor-card-title">Commands</span>
              <button className="editor-card-action" onClick={addCommand}>+ Add</button>
            </div>
            {commands.map((cmd, i) => (
              <div key={i} className="editor-item">
                <div className="editor-item-header">
                  <input className="editor-item-name mono" placeholder="cmd_name" value={cmd.name} onChange={e => updateCommand(i, 'name', e.target.value)} style={{border:'none',background:'none',padding:0,fontFamily:'var(--font-mono)',fontSize:13,fontWeight:500}} />
                  <button className="editor-item-remove" onClick={() => removeCommand(i)}>&#10005;</button>
                </div>
                <input className="cmd-input" value={cmd.run || ''} onChange={e => updateCommand(i, 'run', e.target.value)} placeholder="shell command" />
                {cmd.name && <div className="cmd-hint">Available as {'{{ commands.' + cmd.name + ' }}'} in prompt</div>}
              </div>
            ))}
            {commands.length === 0 && <div style={{color: '#aaa', fontSize: 12}}>No commands defined</div>}
          </div>

          {!isNew && (
            <div className="glass-card">
              <div className="editor-card-header">
                <span className="editor-card-title">Structure</span>
                <div style={{display:'flex', gap: 8}}>
                  <button className="editor-card-action" onClick={handleNewFile}>+ New</button>
                  <button className="editor-card-action" onClick={() => fileInputRef.current?.click()}>Upload</button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleFileUpload(e.target.files)} />
              <div className="file-list">
                {files.map(f => (
                  <div key={f.name} className="file-item">
                    <span className="file-item-name">{f.name}</span>
                    <div style={{display:'flex', alignItems:'center', gap: 8}}>
                      <span className="file-item-size">{formatSize(f.size)}</span>
                      {f.name !== 'agent.md' && (
                        <button className="editor-item-remove" onClick={() => handleDeleteFile(f.name)}>&#10005;</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="file-dropzone" onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }} onDragLeave={e => e.currentTarget.classList.remove('dragover')} onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); handleFileUpload(e.dataTransfer.files); }}>
                Drop files here to upload
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="agent-editor-right">
          <div className="glass-card" style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
            <div className="editor-card-header">
              <span className="editor-card-title">{editorLabel.title}</span>
              <span className="prompt-hint">{editorLabel.hint}</span>
            </div>
            <textarea className="prompt-area" value={body} onChange={e => { setBody(e.target.value); setDirty(true); }} placeholder={editorLabel.placeholder} />
          </div>
          <div className="agent-editor-actions">
            <button className="btn btn-glass" onClick={handleDiscard} disabled={!dirty && !isNew}>Discard</button>
            <button className="btn btn-dark" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

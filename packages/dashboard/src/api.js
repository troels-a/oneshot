const BASE = '/api';

export function getApiKey() {
  return localStorage.getItem('apiKey') || '';
}

export function setApiKey(key) {
  localStorage.setItem('apiKey', key);
}

export function clearApiKey() {
  localStorage.removeItem('apiKey');
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearApiKey();
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res;
}

export async function fetchAgents() {
  const res = await request('/agents');
  const data = await res.json();
  return data.agents;
}

export async function fetchRuns(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.agent) params.set('agent', filters.agent);
  const qs = params.toString();
  const res = await request(`/runs${qs ? `?${qs}` : ''}`);
  return res.json();
}

export async function fetchRun(id) {
  const res = await request(`/runs/${id}`);
  return res.json();
}

export async function fetchRunLogs(id) {
  const res = await request(`/runs/${id}/logs`);
  return res.json();
}

export async function fetchLogContent(runId, filename, { offset = 0, limit = 50 } = {}) {
  const res = await request(`/runs/${runId}/logs/${filename}?offset=${offset}&limit=${limit}`);
  return res.json();
}

export async function fetchSchedules(agent) {
  const res = await request(`/agents/${agent}/schedules`);
  const data = await res.json();
  return data.schedules;
}

export async function clearRuns() {
  const res = await request('/runs', { method: 'DELETE' });
  return res.json();
}

export async function stopRun(id) {
  const res = await request(`/runs/${id}/stop`, { method: 'POST' });
  return res.json();
}

export async function fetchStats() {
  const res = await request('/stats');
  return res.json();
}

// Agent CRUD
export async function fetchAgent(name) {
  const res = await request(`/agents/${name}`);
  return res.json();
}

export async function createAgent(data) {
  const res = await request('/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateAgent(name, data) {
  const res = await request(`/agents/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteAgent(name) {
  await request(`/agents/${name}`, { method: 'DELETE' });
}

// File management
export async function fetchAgentFiles(name) {
  const res = await request(`/agents/${name}/files`);
  return res.json();
}

export async function fetchAgentFile(agent, filename) {
  const res = await request(`/agents/${agent}/files/${filename}`);
  return res.json();
}

export async function updateAgentFile(agent, filename, content) {
  const res = await request(`/agents/${agent}/files/${filename}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function createAgentFile(agent, name, content) {
  const res = await request(`/agents/${agent}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  });
  return res.json();
}

export async function uploadAgentFile(agent, formData) {
  const res = await request(`/agents/${agent}/files/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function deleteAgentFile(agent, filename) {
  await request(`/agents/${agent}/files/${filename}`, { method: 'DELETE' });
}

export async function login(password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Login failed');
  }
  const { token } = await res.json();
  return token;
}

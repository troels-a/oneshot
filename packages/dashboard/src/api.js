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

export async function stopRun(id) {
  const res = await request(`/runs/${id}/stop`, { method: 'POST' });
  return res.json();
}

export async function fetchStats() {
  const res = await request('/stats');
  return res.json();
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

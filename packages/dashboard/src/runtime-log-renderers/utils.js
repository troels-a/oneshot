export function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

export function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function createRawEntry(line) {
  return { type: 'system', label: 'raw', summary: line };
}

export function createFallbackEntry(obj) {
  return {
    type: 'system',
    label: obj.subtype || obj.type || '?',
    summary: truncate(JSON.stringify(obj), 100),
  };
}

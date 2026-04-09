import { createFallbackEntry, stringify, truncate } from './utils';

function describeClaudeToolUse(tool) {
  const name = tool.name || 'unknown';
  const input = tool.input || {};

  if (name === 'Read') return `Read ${input.file_path || '?'}`;
  if (name === 'Write') return `Write ${input.file_path || '?'}`;
  if (name === 'Edit') return `Edit ${input.file_path || '?'}`;
  if (name === 'Bash') return `$ ${truncate(input.command || '?', 80)}`;
  if (name === 'Glob') return `Glob ${input.pattern || '?'}`;
  if (name === 'Grep') return `Grep "${truncate(input.pattern || '?', 40)}"`;
  if (name === 'WebFetch') return `Fetch ${input.url || '?'}`;
  if (name === 'WebSearch') return `Search "${input.query || '?'}"`;
  if (name === 'Task' || name === 'Agent') return `Spawn ${input.description || 'agent'}`;

  return name;
}

export function parseClaudeEntry(obj) {
  const type = obj.type;

  if (type === 'system' && obj.subtype === 'init') {
    return {
      type: 'system',
      label: 'init',
      summary: `Session started in ${obj.cwd || 'unknown'}`,
      metadata: [
        `Model: ${obj.model || '?'}`,
        `Tools: ${obj.tools?.length || 0}`,
        `MCP: ${obj.mcp_servers?.filter(s => s.status === 'connected').length || 0}/${obj.mcp_servers?.length || 0}`,
      ],
      detail: obj.plugins?.length ? `Plugins: ${obj.plugins.map(p => p.name).join(', ')}` : null,
    };
  }

  if (type === 'system' && obj.subtype === 'hook_started') {
    return {
      type: 'system',
      label: 'hook',
      summary: `Hook: ${obj.hook_name || obj.hook_event || 'unknown'}`,
    };
  }

  if (type === 'system' && obj.subtype === 'hook_response') {
    const ok = obj.exit_code === 0 || obj.outcome === 'success';
    return {
      type: ok ? 'system' : 'error',
      label: ok ? 'hook ok' : 'hook fail',
      summary: `${obj.hook_name || 'Hook'} ${ok ? 'completed' : 'failed'}`,
    };
  }

  if (type === 'assistant' && obj.message) {
    const msg = obj.message;
    const textParts = (msg.content || []).filter(c => c.type === 'text');
    const toolParts = (msg.content || []).filter(c => c.type === 'tool_use');
    const thinkParts = (msg.content || []).filter(c => c.type === 'thinking');
    const parts = [];

    if (thinkParts.length) {
      const thinking = thinkParts.map(t => t.thinking).join('\n');
      if (thinking.length > 0) {
        parts.push({
          type: 'system',
          label: 'thinking',
          summary: truncate(thinking, 120),
          detail: thinking.length > 120 ? thinking : null,
        });
      }
    }

    if (textParts.length) {
      const text = textParts.map(t => t.text).join('\n');
      parts.push({
        type: 'assistant',
        label: 'response',
        summary: truncate(text, 200),
        detail: text.length > 200 ? text : null,
      });
    }

    for (const tool of toolParts) {
      const input = typeof tool.input === 'string' ? tool.input : JSON.stringify(tool.input, null, 2);
      parts.push({
        type: 'tool',
        label: tool.name || 'tool',
        summary: describeClaudeToolUse(tool),
        detail: input,
      });
    }

    return parts.length === 1 ? parts[0] : parts.length > 1 ? parts : null;
  }

  if (type === 'result') {
    return {
      type: obj.is_error ? 'error' : 'result',
      label: obj.is_error ? 'error' : 'done',
      summary: truncate(obj.result || `Completed in ${obj.num_turns || '?'} turns`, 200),
      cost: obj.total_cost_usd,
      detail: obj.result && obj.result.length > 200 ? obj.result : null,
      time: obj.duration_ms ? `${(obj.duration_ms / 1000).toFixed(1)}s` : null,
      metadata: [
        obj.num_turns != null ? `${obj.num_turns} turns` : null,
      ].filter(Boolean),
    };
  }

  if (type === 'tool_result') {
    const content = stringify(obj.content);
    return {
      type: obj.is_error ? 'error' : 'system',
      label: obj.is_error ? 'error' : 'tool result',
      summary: truncate(content, 150),
      detail: content.length > 150 ? content : null,
    };
  }

  if (type === 'rate_limit_event') return null;

  return createFallbackEntry(obj);
}

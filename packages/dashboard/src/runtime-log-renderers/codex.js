import { createFallbackEntry, stringify, truncate } from './utils';

function summarizeTodo(items = []) {
  const completed = items.filter(item => item.completed).length;
  return `${completed}/${items.length} complete`;
}

function parseCodexItem(item, phase) {
  if (!item) return null;

  if (item.type === 'agent_message') {
    const text = item.text || '';
    return {
      type: 'assistant',
      label: 'note',
      summary: truncate(text, 220),
      detail: text.length > 220 ? text : null,
    };
  }

  if (item.type === 'command_execution') {
    const command = item.command || '';
    const output = item.aggregated_output || '';
    if (phase === 'started') {
      return {
        type: 'tool',
        label: 'shell',
        summary: truncate(command, 140),
      };
    }

    const ok = item.status === 'completed' && item.exit_code === 0;
    return {
      type: ok ? 'system' : 'error',
      label: ok ? 'shell ok' : 'shell fail',
      summary: truncate(command, 140),
      detail: output || null,
      metadata: [
        item.exit_code != null ? `exit ${item.exit_code}` : null,
      ].filter(Boolean),
    };
  }

  if (item.type === 'mcp_tool_call') {
    const summary = `${item.server || 'MCP'}.${item.tool || 'tool'}`;
    if (phase === 'started') {
      return {
        type: 'tool',
        label: 'mcp',
        summary,
      };
    }

    const ok = item.status === 'completed' && !item.error;
    const resultText = item.error?.message || stringify(item.result);
    return {
      type: ok ? 'system' : 'error',
      label: ok ? 'mcp ok' : 'mcp fail',
      summary,
      detail: resultText,
    };
  }

  if (item.type === 'todo_list') {
    return {
      type: 'system',
      label: 'plan',
      summary: summarizeTodo(item.items),
      detail: (item.items || []).map(task => `${task.completed ? '[x]' : '[ ]'} ${task.text}`).join('\n'),
    };
  }

  return null;
}

export function parseCodexEntry(obj) {
  if (obj.type === 'thread.started') {
    return { type: 'system', label: 'thread', summary: 'Run thread started' };
  }

  if (obj.type === 'turn.started') {
    return { type: 'system', label: 'turn', summary: 'Turn started' };
  }

  if (obj.type === 'turn.completed') {
    return {
      type: 'result',
      label: 'turn done',
      summary: 'Turn completed',
      metadata: [
        obj.usage?.input_tokens != null ? `in ${obj.usage.input_tokens}` : null,
        obj.usage?.output_tokens != null ? `out ${obj.usage.output_tokens}` : null,
      ].filter(Boolean),
    };
  }

  if (obj.type === 'item.started') {
    return parseCodexItem(obj.item, 'started');
  }

  if (obj.type === 'item.updated') {
    return parseCodexItem(obj.item, 'updated');
  }

  if (obj.type === 'item.completed') {
    return parseCodexItem(obj.item, 'completed');
  }

  return createFallbackEntry(obj);
}

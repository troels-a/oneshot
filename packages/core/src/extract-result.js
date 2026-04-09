const path = require('path');
const { readFileSync, existsSync } = require('fs');

const MAX_RESULT_SIZE = 50000;

function extractResult(logDir, runtime) {
  const stdoutPath = path.join(logDir, 'stdout.log');
  if (!existsSync(stdoutPath)) return { result: null, meta: null };

  const content = readFileSync(stdoutPath, 'utf8');
  if (!content.trim()) return { result: null, meta: null };

  if (runtime === 'claude') {
    const lines = content.trimEnd().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'result') {
          return {
            result: obj.result || null,
            meta: {
              cost: obj.total_cost_usd ?? null,
              duration_ms: obj.duration_ms ?? null,
              num_turns: obj.num_turns ?? null,
              is_error: obj.is_error ?? false,
            },
          };
        }
      } catch {
        continue;
      }
    }
    return { result: null, meta: null };
  }

  if (runtime === 'codex') {
    const lines = content.trimEnd().split('\n');
    let result = null;
    let meta = null;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        if (obj.type === 'item.completed' && obj.item?.type === 'agent_message') {
          result = obj.item.text || null;
        }

        if (obj.type === 'turn.completed') {
          meta = {
            input_tokens: obj.usage?.input_tokens ?? null,
            cached_input_tokens: obj.usage?.cached_input_tokens ?? null,
            output_tokens: obj.usage?.output_tokens ?? null,
          };
        }
      } catch {
        continue;
      }
    }

    return { result, meta };
  }

  // node / bash — stdout is the result
  const trimmed = content.length > MAX_RESULT_SIZE
    ? content.slice(-MAX_RESULT_SIZE)
    : content;
  return { result: trimmed, meta: null };
}

module.exports = extractResult;

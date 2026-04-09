import { parseClaudeEntry } from './claude';
import { parseCodexEntry } from './codex';
import { parseDefaultEntry } from './default';
import { createRawEntry } from './utils';

const renderers = {
  claude: {
    parseEntry: parseClaudeEntry,
  },
  codex: {
    parseEntry: parseCodexEntry,
  },
  default: {
    parseEntry: parseDefaultEntry,
  },
};

export function getRuntimeLogRenderer(runtime) {
  return renderers[runtime] || renderers.default;
}

export function parseRuntimeLogLines(lines, runtime) {
  const renderer = getRuntimeLogRenderer(runtime);
  const entries = [];

  for (const line of lines) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      entries.push(createRawEntry(line));
      continue;
    }

    const entry = renderer.parseEntry(obj);
    if (!entry) continue;
    if (Array.isArray(entry)) entries.push(...entry);
    else entries.push(entry);
  }

  return entries.reverse();
}

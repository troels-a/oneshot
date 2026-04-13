const { argsToFlags, createTempExecutable, checkBinary } = require('./utils');

module.exports = {
  name: 'bash',
  label: 'Bash',
  editor: {
    title: 'Script',
    hint: 'Bash — args passed as --key value flags',
    placeholder: '#!/usr/bin/env bash\n# Your script here\necho "args: $@"\n',
  },
  async checkAvailability() {
    return checkBinary('bash');
  },
  runtimeOptions: [],
  normalizeRuntimeOptions() {
    return {};
  },
  buildCommand({ renderedPrompt, args }) {
    const { filePath, cleanup } = createTempExecutable('sh', renderedPrompt);
    return {
      cmd: 'bash',
      args: [filePath, ...argsToFlags(args)],
      cleanup,
    };
  },
};

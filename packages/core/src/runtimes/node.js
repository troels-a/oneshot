const { argsToFlags, createTempExecutable, checkBinary } = require('./utils');

module.exports = {
  name: 'node',
  label: 'Node.js',
  editor: {
    title: 'Script',
    hint: 'Node.js — args passed as --key value flags via process.argv',
    placeholder: '// Your Node.js script here...\nconst args = process.argv.slice(2);\nconsole.log(args);\n',
  },
  async checkAvailability() {
    return checkBinary('node');
  },
  runtimeOptions: [],
  normalizeRuntimeOptions() {
    return {};
  },
  buildCommand({ renderedPrompt, args }) {
    const { filePath, cleanup } = createTempExecutable('js', renderedPrompt);
    return {
      cmd: 'node',
      args: [filePath, ...argsToFlags(args)],
      cleanup,
    };
  },
};

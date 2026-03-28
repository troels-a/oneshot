function renderTemplate(body, args, commandResults) {
  return body.replace(/\{\{\s*(args|commands)\.(\w+)\s*\}\}/g, (match, type, name) => {
    if (type === 'args') return args[name] !== undefined ? String(args[name]) : match;
    if (type === 'commands') return commandResults[name] !== undefined ? commandResults[name] : match;
    return match;
  });
}

module.exports = renderTemplate;

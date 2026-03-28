const { describe, it } = require('node:test');
const assert = require('node:assert');
const renderTemplate = require('../src/render-template');

describe('renderTemplate', () => {
  it('replaces args placeholders', () => {
    const result = renderTemplate('Hello {{ args.name }}!', { name: 'world' }, {});
    assert.strictEqual(result, 'Hello world!');
  });

  it('replaces commands placeholders', () => {
    const result = renderTemplate('Log: {{ commands.git }}', {}, { git: 'abc123' });
    assert.strictEqual(result, 'Log: abc123');
  });

  it('leaves unknown placeholders intact', () => {
    const result = renderTemplate('{{ args.missing }}', {}, {});
    assert.strictEqual(result, '{{ args.missing }}');
  });

  it('handles mixed placeholders', () => {
    const result = renderTemplate(
      '{{ args.x }} and {{ commands.y }}',
      { x: 'A' },
      { y: 'B' }
    );
    assert.strictEqual(result, 'A and B');
  });
});

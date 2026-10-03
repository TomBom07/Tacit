import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRunVariables } from '../src/variables.js';

const skill = {
  variables: {
    title: { type: 'string', required: true },
    count: { type: 'integer' },
    enabled: { type: 'boolean' },
    mode: { type: 'string', enum: ['fast', 'safe'] },
    optional: { type: 'string', default: 'default' }
  }
};

test('validates required inputs and rejects unknown variables', () => {
  assert.throws(() => prepareRunVariables(skill, {}), /Missing required variable: title/);
  assert.throws(() => prepareRunVariables(skill, { title: 'Hi', extra: 'nope' }), /Unknown variable/);
});

test('coerces CLI-friendly primitive strings', () => {
  const values = prepareRunVariables(skill, {
    title: 'Hi',
    count: '3',
    enabled: 'true',
    mode: 'safe'
  });

  assert.deepEqual(values, {
    title: 'Hi',
    count: 3,
    enabled: true,
    mode: 'safe'
  });
});

test('rejects invalid integer, boolean and enum values', () => {
  assert.throws(() => prepareRunVariables(skill, { title: 'x', count: '3.4' }), /integer/);
  assert.throws(() => prepareRunVariables(skill, { title: 'x', enabled: 'yes' }), /boolean/);
  assert.throws(() => prepareRunVariables(skill, { title: 'x', mode: 'turbo' }), /one of/);
});

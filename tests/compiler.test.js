import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRecording } from '../src/compiler.js';

const locator = { tag: 'input', label: 'Email', type: 'email', placeholder: 'you@example.com' };

test('compiles demonstrated input into an overridable variable', () => {
  const skill = compileRecording({
    name: 'Sign in',
    startUrl: 'https://example.com/login',
    events: [
      { action: 'input', locator, value: 'tom@example.com', at: 1 },
      { action: 'click', locator: { tag: 'button', role: 'button', text: 'Continue' }, at: 2 }
    ]
  });

  assert.equal(skill.steps.length, 2);
  assert.equal(skill.steps[0].action, 'input');
  assert.equal(skill.steps[0].value.variable, 'email');
  assert.equal(skill.variables.email.default, 'tom@example.com');
});

test('never stores demonstrated password values', () => {
  const skill = compileRecording({
    name: 'Login',
    startUrl: 'https://example.com',
    events: [{ action: 'input', locator: { tag: 'input', type: 'password', label: 'Password' }, value: 'secret', sensitive: true, at: 1 }]
  });

  assert.equal(skill.variables.password.required, true);
  assert.equal('default' in skill.variables.password, false);
  assert.equal('default' in skill.steps[0].value, false);
});


test('collapses accidental duplicate clicks on the same semantic target', () => {
  const target = { tag: 'input', role: 'checkbox', label: 'Remember me' };
  const skill = compileRecording({
    name: 'Remember me',
    startUrl: 'https://example.com',
    events: [
      { action: 'click', locator: target, at: 1000 },
      { action: 'click', locator: target, at: 1100 }
    ]
  });
  assert.equal(skill.steps.length, 1);
});

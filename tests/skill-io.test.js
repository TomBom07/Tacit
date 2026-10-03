import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkillBundle, parseSkillBundle } from '../src/skill-io.js';

function skill() {
  return {
    schemaVersion: 2,
    id: 'skill_demo',
    name: 'Demo',
    slug: 'demo',
    description: 'Demo procedure',
    variables: {},
    steps: [
      {
        id: 'step_a',
        action: 'click',
        locator: { role: 'button', text: 'Go' },
        timeoutMs: 8000
      }
    ],
    controlFlow: {
      version: 1,
      program: [{ type: 'step', stepId: 'step_a' }],
      loops: [],
      branches: [],
      capabilities: { fixedRepeats: true, guardedBranches: true }
    },
    revision: 1
  };
}

test('exports and imports a validated Tacit skill bundle', () => {
  const original = skill();
  const bundle = createSkillBundle(original);
  assert.equal(bundle.format, 'tacit.skill');
  const imported = parseSkillBundle(bundle);
  assert.equal(imported.id, original.id);
  assert.deepEqual(imported.controlFlow.program, original.controlFlow.program);
});

test('rejects future schemas and invalid program references', () => {
  const future = skill();
  future.schemaVersion = 99;
  assert.throws(() => parseSkillBundle(future), /future skill schema/i);

  const broken = skill();
  broken.controlFlow.program = [{ type: 'step', stepId: 'missing' }];
  assert.throws(() => parseSkillBundle(broken), /unknown step/i);
});

test('upgrades a linear legacy skill with control flow on import', () => {
  const legacy = skill();
  delete legacy.controlFlow;
  legacy.schemaVersion = 1;
  const imported = parseSkillBundle(legacy);
  assert.ok(imported.controlFlow);
  assert.deepEqual(imported.controlFlow.program, [{ type: 'step', stepId: 'step_a' }]);
});

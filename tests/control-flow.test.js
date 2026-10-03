import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeControlFlow, compileProgram, validateProgram } from '../src/control-flow.js';

function step(id, action = 'click', text = 'Next') {
  return {
    id,
    action,
    locator: { role: 'button', text },
    timeoutMs: 8000
  };
}

test('compresses an identical demonstrated sequence into a fixed repeat', () => {
  const steps = [
    step('a', 'click', 'Next'),
    step('b', 'click', 'Confirm'),
    step('c', 'click', 'Next'),
    step('d', 'click', 'Confirm')
  ];

  const program = compileProgram(steps);
  assert.equal(program.length, 1);
  assert.equal(program[0].type, 'repeat');
  assert.equal(program[0].count, 2);
  assert.deepEqual(program[0].body, ['a', 'b']);
});

test('keeps non-repeated work as explicit step nodes', () => {
  const steps = [
    step('a', 'click', 'One'),
    step('b', 'click', 'Two'),
    step('c', 'click', 'Three')
  ];
  assert.deepEqual(compileProgram(steps), [
    { type: 'step', stepId: 'a' },
    { type: 'step', stepId: 'b' },
    { type: 'step', stepId: 'c' }
  ]);
});

test('validates fixed repeats and guarded branches against known steps', () => {
  const skill = {
    steps: [step('a'), step('b')],
    controlFlow: {
      program: [
        { type: 'repeat', count: 2, body: ['a'] },
        {
          type: 'if',
          condition: { type: 'urlIncludes', value: '/done' },
          then: [{ type: 'step', stepId: 'b' }],
          else: []
        }
      ]
    }
  };

  assert.doesNotThrow(() => validateProgram(skill));

  const broken = structuredClone(skill);
  broken.controlFlow.program[0].body = ['missing'];
  assert.throws(() => validateProgram(broken), /unknown step/i);
});

test('analysis advertises actual runner capabilities', () => {
  const result = analyzeControlFlow([step('a')]);
  assert.equal(result.capabilities.fixedRepeats, true);
  assert.equal(result.capabilities.guardedBranches, true);
  assert.ok(Array.isArray(result.program));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRecording, compileRecordingWithAI } from '../src/compiler.js';
import { proposeRepair, applyRepair } from '../src/repair.js';
import { assertRunConfirmed, requiresConfirmation } from '../src/policy.js';

function sendRecording() {
  return {
    name: 'Send support message',
    startUrl: 'https://example.com/support',
    events: [
      {
        action: 'input',
        locator: { tag: 'textarea', role: 'textbox', label: 'Message' },
        value: 'Hello',
        at: 1
      },
      {
        action: 'click',
        locator: { tag: 'button', role: 'button', name: 'Send message', text: 'Send' },
        at: 2
      }
    ]
  };
}

test('compiler annotates human intent and confirmation effects', () => {
  const skill = compileRecording(sendRecording());
  assert.equal(skill.schemaVersion, 2);
  assert.equal(skill.steps[1].intent.effect, 'send');
  assert.equal(skill.steps[1].intent.requiresConfirmation, true);
  assert.ok(skill.semantics.confirmationEffects.includes('send'));
  assert.equal(requiresConfirmation(skill), true);
});

test('AI compiler stays deterministic when no AI endpoint is configured', async () => {
  const skill = await compileRecordingWithAI(sendRecording(), { endpoint: '' });
  assert.equal(skill.compiler.deterministic, true);
  assert.equal(skill.compiler.ai.status, 'disabled');
  assert.equal(skill.steps[1].action, 'click');
});

test('risky skills require explicit confirmation', () => {
  const skill = compileRecording(sendRecording());
  assert.throws(() => assertRunConfirmed(skill, false), /Explicit confirmation is required/);
  assert.doesNotThrow(() => assertRunConfirmed(skill, true));
});

test('blocked run creates a reviewable repair and applying it versions the skill', () => {
  const skill = compileRecording({
    name: 'Continue',
    startUrl: 'https://example.com',
    events: [
      {
        action: 'click',
        locator: { tag: 'button', role: 'button', name: 'Continue', text: 'Continue' },
        at: 1
      }
    ]
  });

  const candidate = { tag: 'button', role: 'button', name: 'Continue', text: 'Continue', testId: 'continue-v2' };
  const run = {
    id: 'run_test',
    log: [
      {
        index: 0,
        action: 'click',
        ok: false,
        reason: 'No confident semantic match.',
        confidence: 0.74,
        candidates: [
          { fingerprint: candidate, score: 0.74 },
          { fingerprint: { tag: 'button', name: 'Cancel' }, score: 0.31 }
        ]
      }
    ]
  };

  const repair = proposeRepair(skill, run);
  assert.equal(repair.status, 'pending');
  assert.equal(repair.proposed.testId, 'continue-v2');
  assert.equal(repair.recommendation, 'apply');

  const revised = applyRepair(skill, repair);
  assert.equal(revised.revision, 2);
  assert.equal(revised.steps[0].locator.testId, 'continue-v2');
  assert.equal(revised.repairHistory.length, 1);
});

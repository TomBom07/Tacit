import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceSkillWithAI, SUGGESTION_SCHEMA } from '../src/ai-compiler.js';

const baseSkill = {
  id: 'skill_test',
  name: 'Send message',
  description: 'Original description',
  startUrl: 'https://example.com',
  variables: {
    message: { type: 'string', description: 'Message', default: 'hello' }
  },
  steps: [
    {
      id: 'step_1',
      action: 'click',
      locator: { role: 'button', name: 'Send' },
      intent: { summary: 'click Send', effect: 'send', target: 'Send' }
    }
  ],
  controlFlow: { version: 1, program: [{ type: 'step', stepId: 'step_1' }] },
  semantics: { goal: 'Send message', summary: 'Original', effects: ['send'] },
  policy: { requireConfirmationFor: ['send'] },
  compiler: { deterministic: true }
};

test('structured schema forbids arbitrary top-level output', () => {
  assert.equal(SUGGESTION_SCHEMA.additionalProperties, false);
  assert.ok(SUGGESTION_SCHEMA.required.includes('steps'));
});

test('Responses adapter enriches semantics without changing executable behavior', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);

    const suggestion = {
      goal: 'Send a support message',
      summary: 'Write and send one support message.',
      description: 'Send a message through the support form.',
      variables: [{ name: 'message', description: 'Message body to send' }],
      steps: [{ id: 'step_1', summary: 'Send the support message', effect: 'send', target: 'Send button' }],
      branchHints: [{ atStepId: 'step_1', description: 'A confirmation screen may appear.', conditionHint: 'Confirmation dialog exists' }],
      loopHints: []
    };

    return new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(suggestion) }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const enhanced = await enhanceSkillWithAI(structuredClone(baseSkill), {
      provider: 'responses',
      endpoint: 'https://api.example.test/v1/responses',
      model: 'test-model',
      apiKey: 'test-key'
    });

    assert.equal(enhanced.compiler.ai.status, 'enhanced');
    assert.equal(enhanced.description, 'Send a message through the support form.');
    assert.equal(enhanced.variables.message.description, 'Message body to send');
    assert.equal(enhanced.semantics.aiInsights.branchHints.length, 1);

    assert.equal(enhanced.steps[0].action, baseSkill.steps[0].action);
    assert.deepEqual(enhanced.steps[0].locator, baseSkill.steps[0].locator);
    assert.deepEqual(enhanced.controlFlow, baseSkill.controlFlow);
    assert.deepEqual(enhanced.policy, baseSkill.policy);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('provider failures fall back to the deterministic skill', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 503 });

  try {
    const enhanced = await enhanceSkillWithAI(structuredClone(baseSkill), {
      provider: 'responses',
      endpoint: 'https://api.example.test/v1/responses',
      model: 'test-model'
    });

    assert.equal(enhanced.compiler.ai.status, 'error');
    assert.equal(enhanced.steps[0].action, 'click');
    assert.deepEqual(enhanced.steps[0].locator, { role: 'button', name: 'Send' });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer, startSkillSync } from '../src/mcp.js';

function skill(id, name, revision = 1) {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    description: name,
    revision,
    updatedAt: `r${revision}`,
    variables: {},
    steps: [],
    semantics: { effects: [], confirmationEffects: [] }
  };
}

test('MCP skill registry hot-adds, updates and removes learned tools', async () => {
  const state = { skills: [skill('skill_a', 'Alpha')] };
  const store = {
    async listSkills() { return state.skills; },
    async getSkill(id) { return state.skills.find((item) => item.id === id || item.slug === id) || null; },
    async queueRun(current, variables) {
      return { id: 'run_test', skillId: current.id, variables, status: 'queued' };
    },
    async getRun() { return null; }
  };

  const server = createMcpServer({ store, skills: state.skills });
  assert.equal(server.tacitSkillTools.size, 1);
  const original = server.tacitSkillTools.get('skill_a');

  const watcher = startSkillSync(server, store, { intervalMs: 60_000 });
  try {
    state.skills = [skill('skill_a', 'Alpha', 2), skill('skill_b', 'Beta')];
    await watcher.sync();

    assert.equal(server.tacitSkillTools.size, 2);
    assert.notEqual(server.tacitSkillTools.get('skill_a').fingerprint, original.fingerprint);

    state.skills = [skill('skill_b', 'Beta')];
    await watcher.sync();
    assert.equal(server.tacitSkillTools.size, 1);
    assert.equal(server.tacitSkillTools.has('skill_a'), false);
  } finally {
    watcher.stop();
  }
});

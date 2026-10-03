import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

async function withStores(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tacit-lock-'));
  const file = path.join(dir, 'store.json');
  try {
    await fn(new Store(file), new Store(file), file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('independent Store instances do not clobber concurrent mutations', async () => {
  await withStores(async (a, b) => {
    const writes = [];
    for (let i = 0; i < 20; i++) {
      const store = i % 2 ? a : b;
      writes.push(store.addSkill({
        id: `skill_${i}`,
        slug: `skill_${i}`,
        name: `Skill ${i}`,
        variables: {},
        steps: []
      }));
    }

    await Promise.all(writes);
    const skills = await a.listSkills();
    assert.equal(skills.length, 20);
    assert.equal(new Set(skills.map((item) => item.id)).size, 20);
  });
});

test('concurrent runners cannot claim the same queued run', async () => {
  await withStores(async (a, b) => {
    const skill = { id: 'skill_claim', slug: 'claim', name: 'Claim', variables: {}, steps: [] };
    const queued = await a.queueRun(skill, {});

    const [left, right] = await Promise.all([
      a.claimNextRun(),
      b.claimNextRun()
    ]);

    const claimed = [left, right].filter(Boolean);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, queued.id);

    const persisted = await a.getRun(queued.id);
    assert.equal(persisted.status, 'running');
  });
});

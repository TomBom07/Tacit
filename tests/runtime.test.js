import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTacitServer } from '../src/server.js';
import { Store } from '../src/store.js';

async function withServer(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tacit-test-'));
  const store = new Store(path.join(dir, 'store.json'));
  const server = createTacitServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await fn({ base, store, file: store.file });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('runtime serves CLI/local requests but rejects normal web origins', async () => {
  await withServer(async ({ base }) => {
    const local = await fetch(`${base}/health`);
    assert.equal(local.status, 200);
    assert.equal((await local.json()).version, 2);

    const hostile = await fetch(`${base}/health`, {
      headers: { origin: 'https://evil.example' }
    });
    assert.equal(hostile.status, 403);

    const extension = await fetch(`${base}/health`, {
      headers: { origin: 'chrome-extension://abcdefghijklmnop' }
    });
    assert.equal(extension.status, 200);
    assert.equal(
      extension.headers.get('access-control-allow-origin'),
      'chrome-extension://abcdefghijklmnop'
    );
  });
});

test('secret run variables never reach persistent store.json', async () => {
  await withServer(async ({ store, file }) => {
    const skill = {
      id: 'skill_secret',
      slug: 'secret',
      name: 'Secret form',
      variables: {
        username: { type: 'string' },
        password: { type: 'string', required: true, secret: true }
      },
      steps: []
    };

    const run = await store.queueRun(skill, {
      username: 'tommy',
      password: 'super-secret-value'
    });

    const persisted = await fs.readFile(file, 'utf8');
    assert.ok(persisted.includes('tommy'));
    assert.ok(!persisted.includes('super-secret-value'));
    assert.deepEqual(run.secretVariableNames, ['password']);

    const claimed = await store.claimNextRun();
    assert.equal(claimed.variables.password, 'super-secret-value');

    const afterClaim = await fs.readFile(file, 'utf8');
    assert.ok(!afterClaim.includes('super-secret-value'));
  });
});


test('cancelled runs are not claimed or overwritten by late results', async () => {
  await withServer(async ({ store }) => {
    const skill = { id: 'skill_cancel', slug: 'cancel', name: 'Cancel demo', variables: {}, steps: [] };

    const queued = await store.queueRun(skill, {});
    const cancelledQueued = await store.cancelRun(queued.id);
    assert.equal(cancelledQueued.status, 'cancelled');
    assert.equal(await store.claimNextRun(), null);

    const running = await store.queueRun(skill, {});
    const claimed = await store.claimNextRun();
    assert.equal(claimed.id, running.id);
    assert.equal(claimed.status, 'running');

    const cancelledRunning = await store.cancelRun(running.id);
    assert.equal(cancelledRunning.status, 'cancelled');

    const late = await store.finishRun(running.id, { status: 'completed', log: [{ ok: true }] });
    assert.equal(late.status, 'cancelled');
  });
});

test('HTTP API lists and cancels runs', async () => {
  await withServer(async ({ base, store }) => {
    const skill = { id: 'skill_http_cancel', slug: 'http_cancel', name: 'HTTP cancel', variables: {}, steps: [] };
    const run = await store.queueRun(skill, {});

    const listed = await fetch(`${base}/runs`);
    assert.equal(listed.status, 200);
    assert.ok((await listed.json()).runs.some((item) => item.id === run.id));

    const cancelled = await fetch(`${base}/runs/${run.id}/cancel`, { method: 'POST' });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).run.status, 'cancelled');
  });
});

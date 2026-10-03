import http from 'node:http';
import { compileRecordingWithAI } from './compiler.js';
import { Store } from './store.js';
import { skillToToolDefinition } from './tool-definition.js';
import { proposeRepair, applyRepair } from './repair.js';
import { assertRunConfirmed } from './policy.js';

function json(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createTacitServer({ store = new Store() } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true, service: 'tacit', version: 1 });
      }

      if (req.method === 'GET' && url.pathname === '/skills') {
        return json(res, 200, { skills: await store.listSkills() });
      }

      if (req.method === 'POST' && url.pathname === '/recordings') {
        const input = await readJson(req);
        const recording = await store.addRecording(input);
        const skill = await compileRecordingWithAI(recording);
        await store.addSkill(skill);
        return json(res, 201, { recording, skill });
      }

      if (req.method === 'POST' && url.pathname === '/skills/compile') {
        const input = await readJson(req);
        const recording = input.recordingId ? await store.getRecording(input.recordingId) : input.recording;
        if (!recording) return json(res, 404, { error: 'Recording not found.' });
        const skill = await compileRecordingWithAI(recording);
        await store.addSkill(skill);
        return json(res, 201, { skill });
      }

      if (req.method === 'GET' && parts[0] === 'skills' && parts[1]) {
        const skill = await store.getSkill(parts[1]);
        if (!skill) return json(res, 404, { error: 'Skill not found.' });
        if (parts[2] === 'tool') return json(res, 200, { tool: skillToToolDefinition(skill) });
        return json(res, 200, { skill });
      }

      if (req.method === 'POST' && url.pathname === '/runs') {
        const input = await readJson(req);
        const skill = await store.getSkill(input.skillId);
        if (!skill) return json(res, 404, { error: 'Skill not found.' });
        const run = await store.queueRun(skill, input.variables || {});
        return json(res, 202, { run });
      }

      if (req.method === 'GET' && url.pathname === '/runs/next') {
        return json(res, 200, { run: await store.claimNextRun() });
      }

      if (req.method === 'GET' && parts[0] === 'runs' && parts[1]) {
        const run = await store.getRun(parts[1]);
        return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found.' });
      }

      if (req.method === 'POST' && parts[0] === 'runs' && parts[1] && parts[2] === 'result') {
        const input = await readJson(req);
        const allowed = new Set(['completed', 'blocked', 'failed']);
        if (!allowed.has(input.status)) return json(res, 400, { error: 'Invalid run status.' });
        const run = await store.finishRun(parts[1], { status: input.status, log: input.log || [], error: input.error || null });
        return run ? json(res, 200, { run }) : json(res, 404, { error: 'Run not found.' });
      }

      return json(res, 404, { error: 'Not found.' });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  });
}

export async function startServer({ port = 4317, host = '127.0.0.1', store } = {}) {
  const server = createTacitServer({ store });
  await new Promise((resolve) => server.listen(port, host, resolve));
  return server;
}

import http from 'node:http';
import { compileRecordingWithAI } from './compiler.js';
import { Store } from './store.js';
import { skillToToolDefinition } from './tool-definition.js';
import { proposeRepair, applyRepair } from './repair.js';
import { assertRunConfirmed } from './policy.js';

function allowedOrigin(origin) {
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) return origin;
  return false;
}

function reply(status, value, origin = null) {
  const body = JSON.stringify(value, null, 2);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
    'cache-control': 'no-store'
  };
  if (origin) headers['access-control-allow-origin'] = origin;
  res.writeHead(status, headers);
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
    const origin = allowedOrigin(req.headers.origin);
    if (origin === false) return json(res, 403, { error: 'Browser origin is not allowed.' });

    if (req.method === 'OPTIONS') return json(res, 204, {}, origin);
    const url = new URL(req.url, 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);
    const reply = (status, value) => reply(status, value, origin);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return reply(200, { ok: true, service: 'tacit', version: 2 });
      }

      if (req.method === 'GET' && url.pathname === '/skills') {
        return reply(200, { skills: await store.listSkills() });
      }

      if (req.method === 'POST' && url.pathname === '/recordings') {
        const input = await readJson(req);
        const recording = await store.addRecording(input);
        const skill = await compileRecordingWithAI(recording);
        await store.addSkill(skill);
        return reply(201, { recording, skill });
      }

      if (req.method === 'POST' && url.pathname === '/skills/compile') {
        const input = await readJson(req);
        const recording = input.recordingId ? await store.getRecording(input.recordingId) : input.recording;
        if (!recording) return reply(404, { error: 'Recording not found.' });
        const skill = await compileRecordingWithAI(recording);
        await store.addSkill(skill);
        return reply(201, { skill });
      }

      if (req.method === 'GET' && parts[0] === 'skills' && parts[1]) {
        const skill = await store.getSkill(parts[1]);
        if (!skill) return reply(404, { error: 'Skill not found.' });
        if (parts[2] === 'tool') return reply(200, { tool: skillToToolDefinition(skill) });
        return reply(200, { skill });
      }

      if (req.method === 'POST' && url.pathname === '/runs') {
        const input = await readJson(req);
        const skill = await store.getSkill(input.skillId);
        if (!skill) return reply(404, { error: 'Skill not found.' });
        try {
          assertRunConfirmed(skill, input.confirmed === true);
        } catch (error) {
          if (error.code === 'CONFIRMATION_REQUIRED') {
            return reply(409, {
              error: error.message,
              confirmationRequired: true,
              effects: error.effects
            });
          }
          throw error;
        }
        const run = await store.queueRun(skill, input.variables || {});
        return reply(202, { run });
      }

      if (req.method === 'GET' && url.pathname === '/runs/next') {
        return reply(200, { run: await store.claimNextRun() });
      }

      if (req.method === 'GET' && parts[0] === 'runs' && parts[1]) {
        const run = await store.getRun(parts[1]);
        return run ? reply(200, { run }) : reply(404, { error: 'Run not found.' });
      }

      if (req.method === 'POST' && parts[0] === 'runs' && parts[1] && parts[2] === 'result') {
        const input = await readJson(req);
        const allowed = new Set(['completed', 'blocked', 'failed']);
        if (!allowed.has(input.status)) return reply(400, { error: 'Invalid run status.' });
        const run = await store.finishRun(parts[1], { status: input.status, log: input.log || [], error: input.error || null });
        if (!run) return reply(404, { error: 'Run not found.' });

        let repair = null;
        if (run.status === 'blocked') {
          const skill = await store.getSkill(run.skillId);
          repair = skill ? proposeRepair(skill, run) : null;
          if (repair) await store.addRepair(repair);
        }

        return reply(200, { run, repair });
      }

      if (req.method === 'GET' && url.pathname === '/repairs') {
        return reply(200, {
          repairs: await store.listRepairs({
            skillId: url.searchParams.get('skillId') || undefined,
            status: url.searchParams.get('status') || undefined
          })
        });
      }

      if (req.method === 'GET' && parts[0] === 'repairs' && parts[1]) {
        const repair = await store.getRepair(parts[1]);
        return repair ? reply(200, { repair }) : reply(404, { error: 'Repair not found.' });
      }

      if (req.method === 'POST' && parts[0] === 'repairs' && parts[1] && parts[2] === 'apply') {
        const input = await readJson(req);
        if (input.approved !== true) {
          return reply(400, { error: 'Explicit approved=true is required.' });
        }

        const repair = await store.getRepair(parts[1]);
        if (!repair) return reply(404, { error: 'Repair not found.' });

        const skill = await store.getSkill(repair.skillId);
        if (!skill) return reply(404, { error: 'Skill not found.' });

        const repaired = applyRepair(skill, repair);
        await store.updateSkill(skill.id, repaired);
        const applied = await store.updateRepair(repair.id, {
          status: 'applied',
          appliedAt: new Date().toISOString()
        });
        return reply(200, { skill: repaired, repair: applied });
      }

      if (req.method === 'POST' && parts[0] === 'repairs' && parts[1] && parts[2] === 'reject') {
        const repair = await store.updateRepair(parts[1], {
          status: 'rejected',
          rejectedAt: new Date().toISOString()
        });
        return repair ? reply(200, { repair }) : reply(404, { error: 'Repair not found.' });
      }

      return reply(404, { error: 'Not found.' });
    } catch (error) {
      return reply(500, { error: error.message });
    }
  });
}

export async function startServer({ port = 4317, host = '127.0.0.1', store } = {}) {
  const server = createTacitServer({ store });
  await new Promise((resolve) => server.listen(port, host, resolve));
  return server;
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { id } from './utils.js';
import { prepareRunVariables } from './variables.js';

function blankState() {
  return { version: 2, recordings: [], skills: [], runs: [], repairs: [] };
}

function normalizeState(state) {
  return {
    ...blankState(),
    ...state,
    recordings: state.recordings || [],
    skills: state.skills || [],
    runs: state.runs || [],
    repairs: state.repairs || []
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Store {
  constructor(file = process.env.TACIT_STORE || path.join(os.homedir(), '.tacit', 'store.json')) {
    this.file = file;
    this.lockFile = `${file}.lock`;
    this.ephemeralSecrets = new Map();
  }

  async read() {
    try {
      return normalizeState(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return blankState();
    }
  }

  async write(state) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await fs.rename(temporary, this.file);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async acquireLock({ timeoutMs = 5000, staleMs = 30000 } = {}) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const started = Date.now();

    while (true) {
      try {
        const handle = await fs.open(this.lockFile, 'wx');
        await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
        return async () => {
          await handle.close().catch(() => {});
          await fs.rm(this.lockFile, { force: true }).catch(() => {});
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;

        try {
          const stat = await fs.stat(this.lockFile);
          if (Date.now() - stat.mtimeMs > staleMs) {
            await fs.rm(this.lockFile, { force: true });
            continue;
          }
        } catch (statError) {
          if (statError.code === 'ENOENT') continue;
          throw statError;
        }

        if (Date.now() - started >= timeoutMs) {
          throw new Error(`Timed out waiting for Tacit store lock: ${this.lockFile}`);
        }
        await sleep(20);
      }
    }
  }

  async mutate(callback) {
    const release = await this.acquireLock();
    try {
      const state = await this.read();
      const result = await callback(state);
      await this.write(state);
      return result;
    } finally {
      await release();
    }
  }

  async addRecording(recording) {
    return this.mutate(async (state) => {
      const saved = {
        ...recording,
        id: recording.id || id('rec'),
        createdAt: recording.createdAt || new Date().toISOString()
      };
      state.recordings.push(saved);
      return saved;
    });
  }

  async getRecording(recordingId) {
    return (await this.read()).recordings.find((item) => item.id === recordingId) || null;
  }

  async addSkill(skill) {
    return this.mutate(async (state) => {
      state.skills.push(skill);
      return skill;
    });
  }

  async updateSkill(skillId, nextSkill) {
    return this.mutate(async (state) => {
      const index = state.skills.findIndex((item) => item.id === skillId);
      if (index === -1) return null;
      state.skills[index] = nextSkill;
      return nextSkill;
    });
  }

  async listSkills() {
    return (await this.read()).skills.toReversed();
  }

  async getSkill(skillId) {
    return (await this.read()).skills.find((item) => item.id === skillId || item.slug === skillId) || null;
  }

  async queueRun(skill, variables = {}) {
    const prepared = prepareRunVariables(skill, variables);
    const secretNames = Object.entries(skill.variables || {})
      .filter(([, definition]) => definition?.secret)
      .map(([name]) => name);
    const persistentVariables = { ...prepared };
    const secrets = {};

    for (const name of secretNames) {
      if (Object.hasOwn(persistentVariables, name)) {
        secrets[name] = persistentVariables[name];
        delete persistentVariables[name];
      }
    }

    const run = {
      id: id('run'),
      skillId: skill.id,
      skill,
      variables: persistentVariables,
      secretVariableNames: secretNames,
      status: 'queued',
      createdAt: new Date().toISOString(),
      log: []
    };

    if (Object.keys(secrets).length) this.ephemeralSecrets.set(run.id, secrets);
    try {
      return await this.mutate(async (state) => {
        state.runs.push(run);
        return run;
      });
    } catch (error) {
      this.ephemeralSecrets.delete(run.id);
      throw error;
    }
  }

  async claimNextRun() {
    return this.mutate(async (state) => {
      const run = state.runs.find((item) => item.status === 'queued');
      if (!run) return null;

      const requiredSecrets = run.secretVariableNames || [];
      const secrets = this.ephemeralSecrets.get(run.id) || {};
      const missingSecrets = requiredSecrets.filter((name) => !Object.hasOwn(secrets, name));

      if (missingSecrets.length) {
        run.status = 'blocked';
        run.error = `Secret input expired: ${missingSecrets.join(', ')}. Queue the run again.`;
        run.finishedAt = new Date().toISOString();
        return null;
      }

      run.status = 'running';
      run.startedAt = new Date().toISOString();
      this.ephemeralSecrets.delete(run.id);

      return {
        ...run,
        variables: { ...run.variables, ...secrets }
      };
    });
  }

  async listRuns({ status, skillId, limit = 50 } = {}) {
    return (await this.read()).runs
      .filter((item) => !status || item.status === status)
      .filter((item) => !skillId || item.skillId === skillId)
      .toReversed()
      .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
  }

  async getRun(runId) {
    return (await this.read()).runs.find((item) => item.id === runId) || null;
  }

  async cancelRun(runId) {
    const run = await this.mutate(async (state) => {
      const found = state.runs.find((item) => item.id === runId);
      if (!found) return null;
      if (!['queued', 'running'].includes(found.status)) return found;
      found.status = 'cancelled';
      found.finishedAt = new Date().toISOString();
      found.error = null;
      return found;
    });
    if (run) this.ephemeralSecrets.delete(run.id);
    return run;
  }

  async finishRun(runId, patch) {
    return this.mutate(async (state) => {
      const run = state.runs.find((item) => item.id === runId);
      if (!run) return null;
      if (run.status === 'cancelled') return run;
      Object.assign(run, patch, { finishedAt: new Date().toISOString() });
      return run;
    });
  }

  async addRepair(repair) {
    return this.mutate(async (state) => {
      state.repairs.push(repair);
      return repair;
    });
  }

  async getRepair(repairId) {
    return (await this.read()).repairs.find((item) => item.id === repairId) || null;
  }

  async listRepairs({ skillId, status } = {}) {
    return (await this.read()).repairs
      .filter((item) => !skillId || item.skillId === skillId)
      .filter((item) => !status || item.status === status)
      .toReversed();
  }

  async updateRepair(repairId, patch) {
    return this.mutate(async (state) => {
      const repair = state.repairs.find((item) => item.id === repairId);
      if (!repair) return null;
      Object.assign(repair, patch, { updatedAt: new Date().toISOString() });
      return repair;
    });
  }
}

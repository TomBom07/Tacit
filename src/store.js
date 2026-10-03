import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { id } from './utils.js';

function blankState() {
  return { version: 1, recordings: [], skills: [], runs: [] };
}

export class Store {
  constructor(file = process.env.TACIT_STORE || path.join(os.homedir(), '.tacit', 'store.json')) {
    this.file = file;
  }

  async read() {
    try {
      return JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return blankState();
    }
  }

  async write(state) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, this.file);
  }

  async addRecording(recording) {
    const state = await this.read();
    const saved = { ...recording, id: recording.id || id('rec'), createdAt: recording.createdAt || new Date().toISOString() };
    state.recordings.push(saved);
    await this.write(state);
    return saved;
  }

  async getRecording(recordingId) {
    return (await this.read()).recordings.find((item) => item.id === recordingId) || null;
  }

  async addSkill(skill) {
    const state = await this.read();
    state.skills.push(skill);
    await this.write(state);
    return skill;
  }

  async listSkills() {
    return (await this.read()).skills.toReversed();
  }

  async getSkill(skillId) {
    return (await this.read()).skills.find((item) => item.id === skillId || item.slug === skillId) || null;
  }

  async queueRun(skill, variables = {}) {
    const state = await this.read();
    const run = {
      id: id('run'),
      skillId: skill.id,
      skill,
      variables,
      status: 'queued',
      createdAt: new Date().toISOString(),
      log: []
    };
    state.runs.push(run);
    await this.write(state);
    return run;
  }

  async claimNextRun() {
    const state = await this.read();
    const run = state.runs.find((item) => item.status === 'queued');
    if (!run) return null;
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    await this.write(state);
    return run;
  }

  async getRun(runId) {
    return (await this.read()).runs.find((item) => item.id === runId) || null;
  }

  async finishRun(runId, patch) {
    const state = await this.read();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) return null;
    Object.assign(run, patch, { finishedAt: new Date().toISOString() });
    await this.write(state);
    return run;
  }
}

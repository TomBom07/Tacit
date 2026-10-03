import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { id } from './utils.js';

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

export class Store {
  constructor(file = process.env.TACIT_STORE || path.join(os.homedir(), '.tacit', 'store.json')) {
    this.file = file;
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

  async updateSkill(skillId, nextSkill) {
    const state = await this.read();
    const index = state.skills.findIndex((item) => item.id === skillId);
    if (index === -1) return null;
    state.skills[index] = nextSkill;
    await this.write(state);
    return nextSkill;
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

  async addRepair(repair) {
    const state = await this.read();
    state.repairs.push(repair);
    await this.write(state);
    return repair;
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
    const state = await this.read();
    const repair = state.repairs.find((item) => item.id === repairId);
    if (!repair) return null;
    Object.assign(repair, patch, { updatedAt: new Date().toISOString() });
    await this.write(state);
    return repair;
  }
}

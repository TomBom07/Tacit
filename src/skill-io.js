import { assertSkill } from './model.js';
import { analyzeControlFlow, validateProgram } from './control-flow.js';

export function createSkillBundle(skill) {
  assertSkill(skill);
  validateProgram(skill);
  return {
    format: 'tacit.skill',
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    skill
  };
}

export function parseSkillBundle(value) {
  const raw = value?.format === 'tacit.skill' ? value.skill : value;
  const skill = assertSkill(structuredClone(raw));

  if ((skill.schemaVersion || 1) > 2) {
    throw new Error(`Unsupported future skill schema: ${skill.schemaVersion}`);
  }

  if (!skill.controlFlow) skill.controlFlow = analyzeControlFlow(skill.steps || []);
  validateProgram(skill);

  skill.schemaVersion = Math.max(1, skill.schemaVersion || 1);
  skill.revision = Math.max(1, skill.revision || 1);
  skill.updatedAt = skill.updatedAt || new Date().toISOString();
  skill.createdAt = skill.createdAt || skill.updatedAt;

  return skill;
}

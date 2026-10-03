const ACTIONS = new Set(['click', 'input', 'select', 'navigate', 'keypress', 'submit', 'wait']);

export function assertRecording(recording) {
  if (!recording || typeof recording !== 'object') throw new Error('Recording must be an object.');
  if (!Array.isArray(recording.events)) throw new Error('Recording.events must be an array.');
  if (!recording.startUrl || typeof recording.startUrl !== 'string') throw new Error('Recording.startUrl is required.');

  for (const [index, event] of recording.events.entries()) {
    if (!event || typeof event !== 'object') throw new Error(`Event ${index} must be an object.`);
    if (!ACTIONS.has(event.action)) throw new Error(`Unsupported action at event ${index}: ${event.action}`);
    if (!event.at) event.at = Date.now();
  }
  return recording;
}

export function assertSkill(skill) {
  if (!skill?.id) throw new Error('Skill.id is required.');
  if (!Array.isArray(skill.steps)) throw new Error('Skill.steps must be an array.');
  return skill;
}

export function resolveValue(value, variables = {}) {
  if (!value || typeof value !== 'object' || !value.variable) return value;
  if (Object.hasOwn(variables, value.variable)) return variables[value.variable];
  if (Object.hasOwn(value, 'default')) return value.default;
  throw new Error(`Missing required variable: ${value.variable}`);
}

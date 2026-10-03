import { skillToToolDefinition } from './tool-definition.js';

export function exportAgentBundle(skill) {
  return {
    tool: skillToToolDefinition(skill),
    invoke: {
      method: 'POST',
      url: 'http://127.0.0.1:4317/runs',
      bodyTemplate: {
        skillId: skill.id,
        variables: '$arguments'
      }
    }
  };
}

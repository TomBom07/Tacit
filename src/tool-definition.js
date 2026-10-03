import { slugify } from './utils.js';

export function skillToToolDefinition(skill) {
  const properties = {};
  const required = [];

  for (const [name, variable] of Object.entries(skill.variables || {})) {
    properties[name] = {
      type: variable.type || 'string',
      description: variable.description || `Input for ${name}`,
      ...(variable.secret ? { writeOnly: true } : {})
    };
    if (variable.required) required.push(name);
  }

  return {
    name: `tacit_${slugify(skill.name)}`.slice(0, 64),
    description: skill.description,
    inputSchema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false
    },
    metadata: {
      skillId: skill.id,
      startUrl: skill.startUrl,
      steps: skill.steps.length,
      revision: skill.revision || 1,
      effects: skill.semantics?.effects || [],
      confirmationEffects: skill.semantics?.confirmationEffects || []
    }
  };
}

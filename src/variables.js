function hasDefault(definition) {
  return Object.prototype.hasOwnProperty.call(definition || {}, 'default');
}

function coerce(name, definition, value) {
  const type = definition?.type || 'string';

  if (Array.isArray(definition?.enum)) {
    if (!definition.enum.includes(value)) {
      throw new Error(`Variable ${name} must be one of: ${definition.enum.join(', ')}.`);
    }
    return value;
  }

  if (type === 'string') {
    if (typeof value === 'string') return value;
    throw new Error(`Variable ${name} must be a string.`);
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`Variable ${name} must be a boolean.`);
  }

  if (type === 'number' || type === 'integer') {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) throw new Error(`Variable ${name} must be a number.`);
    if (type === 'integer' && !Number.isInteger(number)) throw new Error(`Variable ${name} must be an integer.`);
    return number;
  }

  return value;
}

export function prepareRunVariables(skill, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Run variables must be an object.');
  }

  const definitions = skill.variables || {};
  const unknown = Object.keys(input).filter((name) => !Object.hasOwn(definitions, name));
  if (unknown.length) throw new Error(`Unknown variable${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`);

  const output = {};
  for (const [name, definition] of Object.entries(definitions)) {
    if (Object.hasOwn(input, name)) {
      output[name] = coerce(name, definition, input[name]);
      continue;
    }

    if (definition?.required && !hasDefault(definition)) {
      throw new Error(`Missing required variable: ${name}.`);
    }
  }

  return output;
}

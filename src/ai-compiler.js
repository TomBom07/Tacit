function configured(options = {}) {
  return Boolean(options.endpoint || process.env.TACIT_AI_ENDPOINT);
}

function stripFence(text) {
  const trimmed = String(text || '').trim();
  return trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '')
    .trim();
}

function safeJson(text) {
  try { return JSON.parse(stripFence(text)); } catch { return null; }
}

function limitedMerge(skill, suggestion) {
  if (!suggestion || typeof suggestion !== 'object') return skill;

  const stepSuggestions = new Map(
    Array.isArray(suggestion.steps)
      ? suggestion.steps.filter((item) => item && item.id).map((item) => [item.id, item])
      : []
  );

  const steps = skill.steps.map((step) => {
    const proposed = stepSuggestions.get(step.id);
    if (!proposed) return step;
    return {
      ...step,
      intent: {
        ...step.intent,
        summary: proposed.summary || step.intent?.summary,
        effect: proposed.effect || step.intent?.effect,
        target: proposed.target || step.intent?.target
      }
    };
  });

  const variables = Object.fromEntries(
    Object.entries(skill.variables || {}).map(([name, variable]) => {
      const description = suggestion.variables?.[name]?.description;
      return [name, description ? { ...variable, description } : variable];
    })
  );

  return {
    ...skill,
    description: suggestion.description || skill.description,
    semantics: {
      ...skill.semantics,
      goal: suggestion.goal || skill.semantics?.goal,
      summary: suggestion.summary || suggestion.description || skill.semantics?.summary
    },
    variables,
    steps
  };
}

export async function enhanceSkillWithAI(skill, options = {}) {
  if (!configured(options)) {
    return {
      ...skill,
      compiler: { ...(skill.compiler || {}), ai: { status: 'disabled' } }
    };
  }

  const endpoint = options.endpoint || process.env.TACIT_AI_ENDPOINT;
  const model = options.model || process.env.TACIT_AI_MODEL || 'default';
  const apiKey = options.apiKey || process.env.TACIT_AI_API_KEY;

  const compactSkill = {
    name: skill.name,
    description: skill.description,
    startUrl: skill.startUrl,
    variables: skill.variables,
    steps: skill.steps.map(({ id, action, locator, intent }) => ({ id, action, locator, intent }))
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are Tacit\'s procedure compiler.',
            'Infer human intent from a demonstrated browser procedure.',
            'Return JSON only.',
            'You may improve descriptions, the overall goal, variable descriptions, and semantic step labels.',
            'Never add, remove, reorder, or alter executable actions, locators, URLs, values, policies, or IDs.',
            'Shape: {"goal":string,"summary":string,"description":string,"variables":{name:{"description":string}},"steps":[{"id":string,"summary":string,"effect":string,"target":string}]}'
          ].join(' ')
        },
        { role: 'user', content: JSON.stringify(compactSkill) }
      ]
    })
  });

  if (!response.ok) {
    return {
      ...skill,
      compiler: {
        ...(skill.compiler || {}),
        ai: { status: 'error', message: `HTTP ${response.status}` }
      }
    };
  }

  const payload = await response.json();
  const suggestion = safeJson(payload?.choices?.[0]?.message?.content);
  if (!suggestion) {
    return {
      ...skill,
      compiler: {
        ...(skill.compiler || {}),
        ai: { status: 'error', message: 'Model did not return valid JSON.' }
      }
    };
  }

  const enhanced = limitedMerge(skill, suggestion);
  return {
    ...enhanced,
    compiler: {
      ...(enhanced.compiler || {}),
      ai: { status: 'enhanced', model }
    }
  };
}

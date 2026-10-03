const SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['goal', 'summary', 'description', 'variables', 'steps', 'branchHints', 'loopHints'],
  properties: {
    goal: { type: 'string' },
    summary: { type: 'string' },
    description: { type: 'string' },
    variables: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' }
        }
      }
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'summary', 'effect', 'target'],
        properties: {
          id: { type: 'string' },
          summary: { type: 'string' },
          effect: { type: 'string' },
          target: { type: 'string' }
        }
      }
    },
    branchHints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['atStepId', 'description', 'conditionHint'],
        properties: {
          atStepId: { type: 'string' },
          description: { type: 'string' },
          conditionHint: { type: 'string' }
        }
      }
    },
    loopHints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['atStepId', 'description'],
        properties: {
          atStepId: { type: 'string' },
          description: { type: 'string' }
        }
      }
    }
  }
};

function config(options = {}) {
  const apiKey = options.apiKey || process.env.TACIT_AI_API_KEY;
  const model = options.model || process.env.TACIT_AI_MODEL;
  const explicitEndpoint = options.endpoint || process.env.TACIT_AI_ENDPOINT;
  const provider = options.provider || process.env.TACIT_AI_PROVIDER ||
    (explicitEndpoint?.includes('/responses') ? 'responses' : explicitEndpoint ? 'chat' : apiKey ? 'responses' : null);
  const endpoint = explicitEndpoint ||
    (provider === 'responses' && apiKey ? 'https://api.openai.com/v1/responses' : null);

  return { apiKey, model, provider, endpoint };
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

function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

function chatText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || '').join('');
  }
  return null;
}

function limitedMerge(skill, suggestion) {
  if (!suggestion || typeof suggestion !== 'object') return skill;

  const stepSuggestions = new Map(
    Array.isArray(suggestion.steps)
      ? suggestion.steps.filter((item) => item && item.id).map((item) => [item.id, item])
      : []
  );
  const variableSuggestions = new Map(
    Array.isArray(suggestion.variables)
      ? suggestion.variables.filter((item) => item && item.name).map((item) => [item.name, item])
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
      const description = variableSuggestions.get(name)?.description;
      return [name, description ? { ...variable, description } : variable];
    })
  );

  return {
    ...skill,
    description: suggestion.description || skill.description,
    semantics: {
      ...skill.semantics,
      goal: suggestion.goal || skill.semantics?.goal,
      summary: suggestion.summary || suggestion.description || skill.semantics?.summary,
      aiInsights: {
        branchHints: Array.isArray(suggestion.branchHints) ? suggestion.branchHints : [],
        loopHints: Array.isArray(suggestion.loopHints) ? suggestion.loopHints : []
      }
    },
    variables,
    steps
  };
}

function prompt(compactSkill) {
  return [
    'You are Tacit\'s procedure compiler.',
    'Infer human intent from a demonstrated browser procedure.',
    'Improve only semantic descriptions.',
    'Never add, remove, reorder, or alter executable actions, locators, URLs, values, policies, IDs, or control-flow nodes.',
    'Branch and loop hints are non-executable observations only.',
    'Be concise and concrete.',
    JSON.stringify(compactSkill)
  ].join('\n');
}

async function callResponses({ endpoint, apiKey, model }, compactSkill) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      instructions: [
        'Return semantic analysis for a Tacit browser skill.',
        'Do not modify executable behavior.',
        'Use the provided strict JSON schema.'
      ].join(' '),
      input: prompt(compactSkill),
      text: {
        format: {
          type: 'json_schema',
          name: 'tacit_semantics',
          strict: true,
          schema: SUGGESTION_SCHEMA
        }
      }
    })
  });

  return { response, extract: responseText };
}

async function callChat({ endpoint, apiKey, model }, compactSkill) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tacit_semantics',
          strict: true,
          schema: SUGGESTION_SCHEMA
        }
      },
      messages: [
        {
          role: 'system',
          content: 'You are Tacit\'s procedure compiler. Return only the requested structured semantic analysis and never change executable behavior.'
        },
        { role: 'user', content: prompt(compactSkill) }
      ]
    })
  });

  return { response, extract: chatText };
}

export async function enhanceSkillWithAI(skill, options = {}) {
  const settings = config(options);
  if (!settings.endpoint || !settings.model) {
    return {
      ...skill,
      compiler: {
        ...(skill.compiler || {}),
        ai: {
          status: 'disabled',
          reason: settings.endpoint ? 'model_missing' : 'not_configured'
        }
      }
    };
  }

  const compactSkill = {
    name: skill.name,
    description: skill.description,
    startUrl: skill.startUrl,
    variables: Object.fromEntries(
      Object.entries(skill.variables || {}).map(([name, variable]) => [
        name,
        { type: variable.type, description: variable.description, required: variable.required, secret: variable.secret }
      ])
    ),
    steps: skill.steps.map(({ id, action, locator, intent }) => ({ id, action, locator, intent })),
    controlFlow: skill.controlFlow
  };

  try {
    const request = settings.provider === 'responses'
      ? await callResponses(settings, compactSkill)
      : await callChat(settings, compactSkill);

    if (!request.response.ok) {
      return {
        ...skill,
        compiler: {
          ...(skill.compiler || {}),
          ai: { status: 'error', provider: settings.provider, model: settings.model, message: `HTTP ${request.response.status}` }
        }
      };
    }

    const payload = await request.response.json();
    const suggestion = safeJson(request.extract(payload));
    if (!suggestion) {
      return {
        ...skill,
        compiler: {
          ...(skill.compiler || {}),
          ai: { status: 'error', provider: settings.provider, model: settings.model, message: 'Model did not return valid structured JSON.' }
        }
      };
    }

    const enhanced = limitedMerge(skill, suggestion);
    return {
      ...enhanced,
      compiler: {
        ...(enhanced.compiler || {}),
        ai: { status: 'enhanced', provider: settings.provider, model: settings.model }
      }
    };
  } catch (error) {
    return {
      ...skill,
      compiler: {
        ...(skill.compiler || {}),
        ai: { status: 'error', provider: settings.provider, model: settings.model, message: error.message }
      }
    };
  }
}

export { SUGGESTION_SCHEMA };

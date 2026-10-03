const RULES = [
  { pattern: /\b(delete|remove|destroy|erase|trash)\b/i, effect: 'delete', risk: 'high', confirmation: true },
  { pattern: /\b(purchase|buy|pay|checkout|place order|subscribe)\b/i, effect: 'purchase', risk: 'high', confirmation: true },
  { pattern: /\b(send|submit message|reply|email|invite)\b/i, effect: 'send', risk: 'medium', confirmation: true },
  { pattern: /\b(publish|post|deploy|release|make public)\b/i, effect: 'publish', risk: 'high', confirmation: true },
  { pattern: /\b(sign in|log in|login|authenticate)\b/i, effect: 'authenticate', risk: 'medium', confirmation: false },
  { pattern: /\b(download|export|save as)\b/i, effect: 'download', risk: 'low', confirmation: false },
  { pattern: /\b(upload|attach|import)\b/i, effect: 'upload', risk: 'medium', confirmation: false },
  { pattern: /\b(save|create|add|new|update|edit|change)\b/i, effect: 'mutate', risk: 'medium', confirmation: false },
  { pattern: /\b(search|find|filter|look up)\b/i, effect: 'search', risk: 'low', confirmation: false }
];

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function targetText(step) {
  const locator = step.locator || {};
  return clean([
    locator.label,
    locator.name,
    locator.text,
    locator.placeholder,
    locator.role,
    locator.type
  ].filter(Boolean).join(' '));
}

function classify(text, action) {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { effect: rule.effect, risk: rule.risk, confirmation: rule.confirmation };
  }
  if (action === 'input' || action === 'select') return { effect: 'enter_data', risk: 'low', confirmation: false };
  if (action === 'navigate') return { effect: 'navigate', risk: 'low', confirmation: false };
  if (action === 'wait') return { effect: 'wait', risk: 'low', confirmation: false };
  if (action === 'keypress') return { effect: 'interact', risk: 'low', confirmation: false };
  return { effect: 'interact', risk: 'low', confirmation: false };
}

export function inferStepIntent(step, index = 0) {
  const target = targetText(step);
  const context = clean([target, step.url].filter(Boolean).join(' '));
  const classification = classify(context, step.action);

  return {
    sequence: index + 1,
    action: step.action,
    target: target || (step.url ? new URL(step.url).hostname : 'page'),
    effect: classification.effect,
    risk: classification.risk,
    requiresConfirmation: classification.confirmation,
    summary: target ? `${step.action} ${target}` : step.action
  };
}

export function enrichSkillSemantics(skill) {
  const steps = skill.steps.map((step, index) => ({
    ...step,
    intent: inferStepIntent(step, index)
  }));

  const effects = [...new Set(steps.map((step) => step.intent.effect))];
  const confirmationEffects = [...new Set(
    steps.filter((step) => step.intent.requiresConfirmation).map((step) => step.intent.effect)
  )];

  return {
    ...skill,
    steps,
    semantics: {
      goal: skill.name,
      summary: skill.description,
      effects,
      confirmationEffects
    },
    policy: {
      ...skill.policy,
      requireConfirmationFor: [...new Set([
        ...(skill.policy?.requireConfirmationFor || []),
        ...confirmationEffects
      ])]
    }
  };
}

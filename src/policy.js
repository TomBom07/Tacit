export function confirmationEffects(skill) {
  return [...new Set(skill?.semantics?.confirmationEffects || [])];
}

export function requiresConfirmation(skill) {
  return confirmationEffects(skill).length > 0;
}

export function assertRunConfirmed(skill, confirmed = false) {
  const effects = confirmationEffects(skill);
  if (!effects.length || confirmed === true) return;

  const error = new Error(`This skill can perform ${effects.join(', ')}. Explicit confirmation is required.`);
  error.code = 'CONFIRMATION_REQUIRED';
  error.effects = effects;
  throw error;
}

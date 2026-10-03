import { id } from './utils.js';

function firstFailure(run) {
  return (run.log || []).find((entry) => entry && entry.ok === false) || null;
}

export function proposeRepair(skill, run) {
  const failure = firstFailure(run);
  if (!failure || !Number.isInteger(failure.index)) return null;

  const step = skill.steps[failure.index];
  if (!step?.locator) return null;

  const candidates = Array.isArray(failure.candidates) ? failure.candidates : [];
  const best = candidates[0];
  if (!best?.fingerprint) return null;

  const second = candidates[1];
  const confidence = Number(best.score || failure.confidence || 0);
  const margin = Number((confidence - Number(second?.score || 0)).toFixed(4));
  const ambiguous = margin < 0.05;

  return {
    id: id('repair'),
    skillId: skill.id,
    runId: run.id,
    stepId: step.id,
    stepIndex: failure.index,
    status: 'pending',
    createdAt: new Date().toISOString(),
    before: step.locator,
    proposed: best.fingerprint,
    confidence,
    margin,
    ambiguous,
    reason: failure.reason || 'The recorded locator no longer matched confidently.',
    recommendation: ambiguous || confidence < 0.58 ? 'review' : 'apply'
  };
}

export function applyRepair(skill, proposal) {
  if (!proposal || proposal.status !== 'pending') throw new Error('Repair is not pending.');
  const index = skill.steps.findIndex((step) => step.id === proposal.stepId);
  if (index === -1) throw new Error('Repair step no longer exists.');

  const steps = skill.steps.map((step, stepIndex) => stepIndex === index
    ? { ...step, locator: proposal.proposed }
    : step
  );

  const appliedAt = new Date().toISOString();
  return {
    ...skill,
    revision: (skill.revision || 1) + 1,
    updatedAt: appliedAt,
    steps,
    repairHistory: [
      ...(skill.repairHistory || []),
      {
        repairId: proposal.id,
        runId: proposal.runId,
        stepId: proposal.stepId,
        before: proposal.before,
        after: proposal.proposed,
        confidence: proposal.confidence,
        appliedAt
      }
    ]
  };
}

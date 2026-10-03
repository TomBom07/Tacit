import { assertRecording } from './model.js';
import { compactObject, id, slugify } from './utils.js';
import { enrichSkillSemantics } from './intent.js';
import { enhanceSkillWithAI } from './ai-compiler.js';
import { analyzeControlFlow } from './control-flow.js';

function parameterName(locator = {}, index = 0) {
  const seed = locator.label || locator.name || locator.placeholder || locator.id || `input_${index + 1}`;
  return slugify(seed).slice(0, 40);
}

function compileValue(event, variables, index) {
  const key = parameterName(event.locator, index);
  const uniqueKey = variables[key] ? `${key}_${index + 1}` : key;
  const isSensitive = event.sensitive || event.locator?.type === 'password';

  variables[uniqueKey] = compactObject({
    type: 'string',
    description: event.locator?.label || event.locator?.name || event.locator?.placeholder || 'Recorded input',
    required: Boolean(isSensitive),
    secret: Boolean(isSensitive),
    default: isSensitive ? undefined : event.value
  });

  return compactObject({ variable: uniqueKey, default: isSensitive ? undefined : event.value });
}

function dedupe(events) {
  const output = [];
  for (const event of events) {
    const previous = output.at(-1);
    const sameTarget = previous && JSON.stringify(previous.locator) === JSON.stringify(event.locator);
    const sameInput = sameTarget && previous.action === 'input' && event.action === 'input';
    const duplicateClick = sameTarget && previous.action === 'click' && event.action === 'click' &&
      Math.abs((event.at || 0) - (previous.at || 0)) < 300;
    if (sameInput || duplicateClick) output[output.length - 1] = event;
    else output.push(event);
  }
  return output;
}

export function compileRecording(rawRecording) {
  const recording = assertRecording(structuredClone(rawRecording));
  const variables = {};
  const steps = [];
  let inputIndex = 0;

  for (const event of dedupe(recording.events)) {
    if (event.action === 'navigate' && event.url === recording.startUrl && steps.length === 0) continue;

    if (event.action === 'input' || event.action === 'select') {
      steps.push({
        id: id('step'),
        action: event.action,
        locator: event.locator,
        value: compileValue(event, variables, inputIndex++),
        timeoutMs: 8000
      });
      continue;
    }

    steps.push(compactObject({
      id: id('step'),
      action: event.action,
      locator: event.locator,
      url: event.url,
      key: event.key,
      milliseconds: event.milliseconds,
      timeoutMs: event.action === 'navigate' ? 15000 : 8000
    }));
  }

  const name = recording.name || 'Untitled workflow';
  const now = new Date().toISOString();

  return enrichSkillSemantics({
    schemaVersion: 2,
    id: id('skill'),
    name,
    slug: slugify(name),
    description: recording.description || `Browser procedure learned from a ${steps.length}-step demonstration.`,
    startUrl: recording.startUrl,
    variables,
    steps,
    controlFlow: analyzeControlFlow(steps),
    createdAt: now,
    updatedAt: now,
    source: {
      type: 'demonstration',
      recordingId: recording.id || null
    },
    policy: {
      locatorThreshold: 0.58,
      stopOnAmbiguity: true,
      requireConfirmationFor: ['purchase', 'send', 'delete', 'publish']
    },
    revision: 1,
    compiler: {
      deterministic: true,
      ai: { status: 'pending' }
    }
  });
}

export async function compileRecordingWithAI(rawRecording, options = {}) {
  const deterministic = compileRecording(rawRecording);
  return enhanceSkillWithAI(deterministic, options);
}

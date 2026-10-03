function comparable(step) {
  const { id, intent, ...rest } = step;
  return rest;
}

function signature(step) {
  return JSON.stringify(comparable(step));
}

function sameBlock(steps, left, right, width) {
  for (let offset = 0; offset < width; offset++) {
    if (signature(steps[left + offset]) !== signature(steps[right + offset])) return false;
  }
  return true;
}

function bestRepeatAt(steps, start, maxWidth = 6) {
  const remaining = steps.length - start;
  let best = null;

  for (let width = 1; width <= Math.min(maxWidth, Math.floor(remaining / 2)); width++) {
    let count = 1;
    while (
      start + width * (count + 1) <= steps.length &&
      sameBlock(steps, start, start + width * count, width)
    ) {
      count++;
    }

    if (count < 2) continue;
    const savedNodes = width * (count - 1);
    if (!best || savedNodes > best.savedNodes || (savedNodes === best.savedNodes && width > best.width)) {
      best = { width, count, savedNodes };
    }
  }

  return best;
}

export function compileProgram(steps) {
  const nodes = [];
  let index = 0;

  while (index < steps.length) {
    const repeat = bestRepeatAt(steps, index);
    if (!repeat) {
      nodes.push({ type: 'step', stepId: steps[index].id });
      index++;
      continue;
    }

    const body = steps.slice(index, index + repeat.width).map((step) => step.id);
    nodes.push({
      type: 'repeat',
      count: repeat.count,
      body
    });
    index += repeat.width * repeat.count;
  }

  return nodes;
}

export function analyzeControlFlow(steps) {
  const program = compileProgram(steps);
  const loops = program
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === 'repeat')
    .map(({ node, index }) => ({
      programIndex: index,
      count: node.count,
      body: node.body
    }));

  return {
    version: 1,
    program,
    loops,
    branches: [],
    capabilities: {
      fixedRepeats: true,
      guardedBranches: true
    }
  };
}

export function validateProgram(skill) {
  const stepIds = new Set((skill.steps || []).map((step) => step.id));
  const program = skill.controlFlow?.program || (skill.steps || []).map((step) => ({ type: 'step', stepId: step.id }));

  const visit = (node) => {
    if (!node || typeof node !== 'object') throw new Error('Invalid control-flow node.');
    if (node.type === 'step') {
      if (!stepIds.has(node.stepId)) throw new Error(`Program references unknown step: ${node.stepId}`);
      return;
    }
    if (node.type === 'repeat') {
      if (!Number.isInteger(node.count) || node.count < 1 || node.count > 100) throw new Error('Repeat count must be between 1 and 100.');
      if (!Array.isArray(node.body) || !node.body.length) throw new Error('Repeat body must contain step IDs.');
      for (const stepId of node.body) if (!stepIds.has(stepId)) throw new Error(`Repeat references unknown step: ${stepId}`);
      return;
    }
    if (node.type === 'if') {
      if (!node.condition || typeof node.condition !== 'object') throw new Error('Branch condition is required.');
      for (const child of node.then || []) visit(child);
      for (const child of node.else || []) visit(child);
      return;
    }
    throw new Error(`Unsupported control-flow node: ${node.type}`);
  };

  for (const node of program) visit(node);
  return program;
}

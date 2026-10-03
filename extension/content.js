const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 160);

function labelFor(element) {
  if (element.labels?.length) return normalize([...element.labels].map((label) => label.innerText).join(' '));
  const aria = element.getAttribute('aria-label');
  if (aria) return normalize(aria);
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return normalize(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' '));
  return '';
}

function implicitRole(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const type = element.type;
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    return 'textbox';
  }
  return '';
}

function fingerprint(element) {
  const text = normalize(element.innerText || element.textContent);
  return Object.fromEntries(Object.entries({
    testId: element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-cy'),
    id: element.id,
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || implicitRole(element),
    name: element.getAttribute('aria-label') || labelFor(element) || text,
    label: labelFor(element),
    placeholder: element.getAttribute('placeholder'),
    text,
    href: element instanceof HTMLAnchorElement ? element.getAttribute('href') : '',
    type: element instanceof HTMLInputElement ? element.type : ''
  }).filter(([, value]) => value));
}

function send(event) {
  chrome.runtime.sendMessage({ type: 'TACIT_EVENT', event: { ...event, at: Date.now(), pageUrl: location.href } }).catch(() => {});
}

document.addEventListener('click', (event) => {
  const target = event.target?.closest?.('button,a,input,[role],summary,label,[data-testid],[data-test],[data-cy]') || event.target;
  if (!(target instanceof Element)) return;
  send({ action: 'click', locator: fingerprint(target) });
}, true);

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target instanceof HTMLSelectElement) {
    send({ action: 'select', locator: fingerprint(target), value: target.value });
    return;
  }
  send({
    action: 'input',
    locator: fingerprint(target),
    value: target.type === 'password' ? undefined : target.value,
    sensitive: target.type === 'password'
  });
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const target = event.target instanceof Element ? event.target : document.activeElement;
  if (target instanceof Element) send({ action: 'keypress', key: 'Enter', locator: fingerprint(target) });
}, true);

function score(expected, candidate) {
  const weights = { testId: .34, id: .22, role: .12, name: .16, label: .16, placeholder: .10, text: .10, href: .08, type: .05, tag: .03 };
  let total = 0;
  let points = 0;
  const norm = (value) => normalize(value).toLowerCase();
  for (const [key, weight] of Object.entries(weights)) {
    if (!expected[key]) continue;
    total += weight;
    const a = norm(expected[key]);
    const b = norm(candidate[key]);
    if (!a || !b) continue;
    if (a === b) points += weight;
    else if (a.includes(b) || b.includes(a)) points += weight * .78;
  }
  return total ? points / total : 0;
}

function candidateElements(locator) {
  const selectors = [];
  if (locator.testId) selectors.push(
    `[data-testid="${CSS.escape(locator.testId)}"]`,
    `[data-test="${CSS.escape(locator.testId)}"]`,
    `[data-cy="${CSS.escape(locator.testId)}"]`
  );
  if (locator.id) selectors.push(`#${CSS.escape(locator.id)}`);
  if (locator.role) selectors.push(`[role="${CSS.escape(locator.role)}"]`);
  if (locator.tag) selectors.push(locator.tag);
  selectors.push('button', 'a[href]', 'input', 'textarea', 'select', '[role]', '[tabindex]');

  const found = new Set();
  for (const selector of selectors) {
    try { document.querySelectorAll(selector).forEach((element) => found.add(element)); } catch {}
  }
  return [...found].slice(0, 1500);
}

function resolve(locator, threshold = .58) {
  const ranked = candidateElements(locator)
    .map((element) => ({ element, fingerprint: fingerprint(element) }))
    .map((entry) => ({ ...entry, score: score(locator, entry.fingerprint) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < threshold) {
    return {
      element: null,
      confidence: best?.score || 0,
      candidates: ranked.slice(0, 3).map(({ fingerprint, score }) => ({ fingerprint, score }))
    };
  }
  return {
    element: best.element,
    confidence: best.score,
    candidates: ranked.slice(0, 3).map(({ fingerprint, score }) => ({ fingerprint, score }))
  };
}

function resolveVariable(value, variables) {
  if (!value?.variable) return value;
  if (Object.prototype.hasOwnProperty.call(variables, value.variable)) return variables[value.variable];
  if (Object.prototype.hasOwnProperty.call(value, 'default')) return value.default;
  throw new Error(`Missing required variable: ${value.variable}`);
}

async function execute(step, variables) {
  if (step.action === 'wait') {
    await new Promise((resolve) => setTimeout(resolve, step.milliseconds || 500));
    return { ok: true };
  }

  const match = resolve(step.locator || {}, .58);
  if (!match.element) {
    return {
      ok: false,
      reason: 'No confident semantic match.',
      confidence: match.confidence,
      candidates: match.candidates
    };
  }
  const element = match.element;

  if (step.action === 'click' || step.action === 'submit') element.click();
  else if (step.action === 'input') {
    const value = resolveVariable(step.value, variables);
    element.focus();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (step.action === 'select') {
    element.value = resolveVariable(step.value, variables);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (step.action === 'keypress') {
    element.focus();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: step.key, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: step.key, bubbles: true }));
  }

  return { ok: true, confidence: match.confidence };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'TACIT_EXECUTE_STEP') return;
  execute(message.step, message.variables || {})
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, reason: error.message }));
  return true;
});

const WEIGHTS = {
  testId: 0.34,
  id: 0.22,
  role: 0.12,
  name: 0.16,
  label: 0.16,
  placeholder: 0.10,
  text: 0.10,
  href: 0.08,
  type: 0.05,
  tag: 0.03
};

function norm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function similarity(a, b) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.78;

  const aWords = new Set(left.split(' '));
  const bWords = new Set(right.split(' '));
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union ? (intersection / union) * 0.7 : 0;
}

export function scoreLocator(expected = {}, candidate = {}) {
  let availableWeight = 0;
  let score = 0;

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    if (!expected[key]) continue;
    availableWeight += weight;
    score += weight * similarity(expected[key], candidate[key]);
  }

  return availableWeight ? Number((score / availableWeight).toFixed(4)) : 0;
}

export function rankCandidates(locator, candidates = []) {
  return candidates
    .map((candidate, index) => ({ index, candidate, score: scoreLocator(locator, candidate) }))
    .sort((a, b) => b.score - a.score);
}

export function chooseCandidate(locator, candidates, threshold = 0.58) {
  const ranked = rankCandidates(locator, candidates);
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = Boolean(best && second && best.score >= threshold && second.score >= threshold && best.score - second.score < 0.05);
  if (!best || best.score < threshold || ambiguous) {
    return { match: null, confidence: best?.score ?? 0, ambiguous, ranked: ranked.slice(0, 5) };
  }
  return { match: best.candidate, confidence: best.score, ambiguous: false, ranked: ranked.slice(0, 5) };
}

const $ = (id) => document.getElementById(id);
const idle = $('idle');
const recording = $('recording');
const learned = $('learned');
const repairs = $('repairs');
const repairList = $('repairList');

async function message(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function refresh() {
  const state = await message({ type: 'TACIT_STATE' });
  $('status').classList.toggle('online', state.daemon);
  $('daemon').textContent = state.daemon ? 'Runtime online' : 'Runtime offline';
  idle.hidden = state.recording;
  recording.hidden = !state.recording;
  if (state.lastSkill) {
    learned.hidden = false;
    $('skillName').textContent = state.lastSkill.name;
    $('skillMeta').textContent = `${state.lastSkill.steps.length} semantic steps · ${Object.keys(state.lastSkill.variables || {}).length} inputs`;
  }
  $('start').disabled = !state.daemon;

  const pending = state.repairs || [];
  repairs.hidden = pending.length === 0;
  $('repairCount').textContent = pending.length ? `${pending.length} pending` : '';
  repairList.innerHTML = '';

  for (const repair of pending) {
    const card = document.createElement('div');
    card.className = 'repairCard';

    const before = repair.before?.testId || repair.before?.name || repair.before?.label || repair.before?.text || repair.before?.id || 'old target';
    const after = repair.proposed?.testId || repair.proposed?.name || repair.proposed?.label || repair.proposed?.text || repair.proposed?.id || 'new target';

    const title = document.createElement('div');
    title.className = 'repairTitle';
    title.innerHTML = `<span>Step ${repair.stepIndex + 1}</span><span class="repairConfidence">${Math.round((repair.confidence || 0) * 100)}% match</span>`;

    const diff = document.createElement('div');
    diff.className = 'repairDiff';
    diff.textContent = `${before} → ${after}`;

    const actions = document.createElement('div');
    actions.className = 'repairActions';

    const apply = document.createElement('button');
    apply.textContent = repair.recommendation === 'apply' ? 'Apply fix' : 'Review & apply';
    apply.dataset.action = 'apply';
    apply.dataset.id = repair.id;

    const reject = document.createElement('button');
    reject.textContent = 'Reject';
    reject.className = 'reject';
    reject.dataset.action = 'reject';
    reject.dataset.id = repair.id;

    actions.append(apply, reject);
    card.append(title, diff, actions);
    repairList.append(card);
  }
}

$('start').addEventListener('click', async () => {
  const result = await message({
    type: 'TACIT_START',
    name: $('name').value.trim() || 'Untitled workflow'
  });
  if (!result?.ok) alert(result?.error || 'Could not start recording.');
  await refresh();
});

$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = 'Compiling…';
  const result = await message({ type: 'TACIT_STOP' });
  if (!result?.ok) alert(result?.error || 'Could not compile skill.');
  $('stop').disabled = false;
  $('stop').textContent = 'Finish skill';
  await refresh();
});

refresh().catch(console.error);


repairList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action][data-id]');
  if (!button) return;

  button.disabled = true;
  const type = button.dataset.action === 'apply' ? 'TACIT_REPAIR_APPLY' : 'TACIT_REPAIR_REJECT';
  const result = await message({ type, repairId: button.dataset.id });
  if (!result?.ok) alert(result?.error || 'Could not update repair.');
  await refresh();
});

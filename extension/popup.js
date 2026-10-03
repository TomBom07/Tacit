const $ = (id) => document.getElementById(id);
const idle = $('idle');
const recording = $('recording');
const learned = $('learned');

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

const API = 'http://127.0.0.1:4317';
let session = null;
let polling = false;
let sessionWrites = Promise.resolve();

async function restoreSession() {
  if (session) return session;
  const saved = await chrome.storage.local.get('recordingSession');
  session = saved.recordingSession || null;
  return session;
}

function persistSession() {
  sessionWrites = sessionWrites.then(() => chrome.storage.local.set({
    recording: Boolean(session),
    recordingSession: session
  }));
  return sessionWrites;
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Tacit runtime returned ${response.status}`);
  return response.json();
}

async function state() {
  await restoreSession();
  const saved = await chrome.storage.local.get(['lastSkill']);
  return { recording: Boolean(session), session, lastSkill: saved.lastSkill || null, daemon: await health() };
}

async function health() {
  try { await api('/health'); return true; } catch { return false; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TACIT_EVENT') {
    restoreSession().then(async () => {
      if (session && sender.tab?.id === session.tabId) {
        session.events.push(message.event);
        await persistSession();
      }
      sendResponse({ ok: true });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'TACIT_STATE') {
    state().then(sendResponse);
    return true;
  }

  if (message.type === 'TACIT_START') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id || !tab.url) throw new Error('No active browser tab.');
      session = { name: message.name || 'Untitled workflow', tabId: tab.id, startUrl: tab.url, events: [], startedAt: Date.now() };
      return persistSession();
    }).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'TACIT_STOP') {
    restoreSession().then(async () => {
      const finished = session;
      session = null;
      await persistSession();
      if (!finished) { sendResponse({ ok: false, error: 'Nothing is being recorded.' }); return; }
      const { skill } = await api('/recordings', { method: 'POST', body: JSON.stringify(finished) });
      await chrome.storage.local.set({ lastSkill: skill });
      sendResponse({ ok: true, skill });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  restoreSession().then(async () => {
    if (!session || details.tabId !== session.tabId || details.frameId !== 0) return;
    if (details.url === session.startUrl && session.events.length === 0) return;
    session.events.push({ action: 'navigate', url: details.url, at: Date.now() });
    await persistSession();
  }).catch(() => {});
});

function waitForLoad(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('Navigation timed out.')); }, timeoutMs);
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function executeRun(run) {
  const log = [];
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab for replay.');

  if (run.skill.startUrl && tab.url !== run.skill.startUrl) {
    await chrome.tabs.update(tab.id, { url: run.skill.startUrl });
    await waitForLoad(tab.id);
  }

  for (let index = 0; index < run.skill.steps.length; index++) {
    const step = run.skill.steps[index];
    if (step.action === 'navigate') {
      await chrome.tabs.update(tab.id, { url: step.url });
      await waitForLoad(tab.id, step.timeoutMs || 15000);
      log.push({ index, action: step.action, ok: true, url: step.url });
      continue;
    }

    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { type: 'TACIT_EXECUTE_STEP', step, variables: run.variables || {} });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
      result = await chrome.tabs.sendMessage(tab.id, { type: 'TACIT_EXECUTE_STEP', step, variables: run.variables || {} });
    }
    log.push({ index, action: step.action, ...result });
    if (!result?.ok) {
      await api(`/runs/${run.id}/result`, { method: 'POST', body: JSON.stringify({ status: 'blocked', log, error: result?.reason || 'Replay blocked.' }) });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }

  await api(`/runs/${run.id}/result`, { method: 'POST', body: JSON.stringify({ status: 'completed', log }) });
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const { run } = await api('/runs/next');
    if (run) await executeRun(run);
  } catch (error) {
    console.debug('[Tacit]', error.message);
  } finally {
    polling = false;
  }
}

chrome.alarms.create('tacit-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tacit-poll') poll();
});
chrome.runtime.onStartup.addListener(poll);
chrome.runtime.onInstalled.addListener(poll);
restoreSession().catch(() => {});
setInterval(poll, 1100);

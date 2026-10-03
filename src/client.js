const DEFAULT_BASE_URL = 'http://127.0.0.1:4317';

export class RuntimeClient {
  constructor(baseUrl = process.env.TACIT_RUNTIME_URL || DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(`Tacit runtime is unavailable at ${this.baseUrl}: ${error.message}`);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Tacit runtime returned HTTP ${response.status}.`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  health() {
    return this.request('/health');
  }

  queueRun(skillId, variables = {}, confirmed = false) {
    return this.request('/runs', {
      method: 'POST',
      body: { skillId, variables, confirmed }
    });
  }

  listRuns({ status, skillId, limit } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (skillId) params.set('skillId', skillId);
    if (limit) params.set('limit', String(limit));
    const query = params.size ? `?${params}` : '';
    return this.request(`/runs${query}`);
  }

  getRun(runId) {
    return this.request(`/runs/${encodeURIComponent(runId)}`);
  }

  cancelRun(runId) {
    return this.request(`/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: {} });
  }
}

export function createRuntimeClient(baseUrl) {
  return new RuntimeClient(baseUrl);
}

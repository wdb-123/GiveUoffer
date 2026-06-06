(function () {
  async function requestJson(path, options = {}) {
    const { method = 'GET', headers = {}, body } = options;
    const normalizedHeaders = { ...headers };
    if (body && !normalizedHeaders['content-type'] && !normalizedHeaders['Content-Type']) {
      normalizedHeaders['content-type'] = 'application/json';
    }
    const response = await fetch(path, {
      method,
      headers: normalizedHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
      }
      const text = await response.text().catch(() => '');
      throw new Error(text.trim() || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { __raw: await response.text() };
    }

    return response.json();
  }

  async function get(path) {
    return requestJson(path, { method: 'GET' });
  }

  async function post(path, body) {
    return requestJson(path, {
      method: 'POST',
      body,
    });
  }

  window.ApiClient = {
    async getJson(path) {
      const payload = await get(path);
      if (payload && payload.__raw !== undefined) {
        throw new Error(`Expected JSON response for GET ${path}`);
      }
      return payload;
    },
    async postJson(path, body) {
      const payload = await post(path, body);
      if (payload && payload.__raw !== undefined) {
        throw new Error(`Expected JSON response for POST ${path}`);
      }
      return payload;
    },
  };
})();

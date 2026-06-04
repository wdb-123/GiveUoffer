const REQUEST_TYPE = 'CAREER_OPS_PARSE_JOB_WITH_EXTENSION';
const RESPONSE_TYPE = 'CAREER_OPS_PARSE_JOB_WITH_EXTENSION_RESULT';

window.postMessage({ source: 'career-ops-extension', type: 'CAREER_OPS_EXTENSION_READY' }, window.location.origin);

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const message = event.data || {};
  if (message.source === 'career-ops-bridge' && message.type === 'CAREER_OPS_BRIDGE_PING') {
    window.postMessage({ source: 'career-ops-extension', type: 'CAREER_OPS_EXTENSION_READY' }, window.location.origin);
    return;
  }
  if (message.source !== 'career-ops' || message.type !== REQUEST_TYPE) return;

  try {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      throw new Error('Chrome 扩展上下文不可用，请在扩展管理页重新加载插件。');
    }
    const response = await runtime.sendMessage({
      type: 'PARSE_JOB',
      requestId: message.requestId,
      job: message.job || {},
    });
    window.postMessage({
      source: 'career-ops-extension',
      type: RESPONSE_TYPE,
      requestId: message.requestId,
      ok: Boolean(response?.ok),
      response,
    }, window.location.origin);
  } catch (err) {
    window.postMessage({
      source: 'career-ops-extension',
      type: RESPONSE_TYPE,
      requestId: message.requestId,
      ok: false,
      response: { ok: false, error: String(err?.message || err) },
    }, window.location.origin);
  }
});

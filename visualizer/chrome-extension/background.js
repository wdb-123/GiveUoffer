const LOCAL_UPDATE_API = 'http://localhost:4173/api/recruitment-market/update-job';
const LOCAL_EXTENSION_REGISTER_API = 'http://localhost:4173/api/recruitment-market/extension-register';
const LOCAL_EXTENSION_CLAIM_API = 'http://localhost:4173/api/recruitment-market/extension-claim-task';
const LOCAL_EXTENSION_COMPLETE_API = 'http://localhost:4173/api/recruitment-market/extension-task-complete';
const TASK_POLL_ALARM = 'career-ops-task-poll';
let isPollingTaskQueue = false;

initializeExtension().catch(() => {});
chrome.runtime.onInstalled.addListener(() => { initializeExtension().catch(() => {}); });
chrome.runtime.onStartup?.addListener(() => { initializeExtension().catch(() => {}); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === TASK_POLL_ALARM) pollTaskQueue().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'PARSE_JOB') return false;
  parseJob(message.job || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

async function parseJob(job) {
  if (!job.id) throw new Error('缺少岗位 ID。');
  if (!job.url) throw new Error('这个岗位没有链接，无法打开解析。');

  const tab = await tabsCreate({ url: job.url, active: false });
  try {
    await waitForTabComplete(tab.id);
    await ensureScraperInjected(tab.id);
    const scraped = await sendScrapeMessage(tab.id);
    const payload = buildUpdatePayload(job, scraped);
    const updateResponse = await postJson(LOCAL_UPDATE_API, payload);
    if (!updateResponse?.updated) {
      throw new Error(updateResponse?.error || '本地岗位库回写失败。');
    }
    return {
      message: updateResponse.message || `已回写：${payload.company || ''} ${payload.role || ''}`.trim(),
      job: updateResponse.job,
      scraped,
    };
  } finally {
    if (tab?.id) {
      try {
        await tabsRemove(tab.id);
      } catch (_err) {
        // Ignore tab cleanup failures; they should not poison the extension runtime.
      }
    }
  }
}

function buildUpdatePayload(job, scraped) {
  const company = scraped.company || job.company || '';
  const role = scraped.role || job.role || '';
  if (/待解析/.test(`${company} ${role}`)) {
    throw new Error('插件没有识别出有效公司和岗位。');
  }
  return {
    id: job.id,
    compact: true,
    company,
    role,
    location: scraped.location || job.location || '',
    salary: scraped.salary || job.salary || '',
    keywords: scraped.keywords || '',
    reason: scraped.reason || '',
    rawText: scraped.rawText || '',
    url: scraped.url || job.url || '',
  };
}

async function waitForTabComplete(tabId) {
  const current = await tabsGet(tabId);
  if (current.status === 'complete') {
    await sleep(1500);
    return;
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('页面加载超时。'));
    }, 30000);
    const listener = (updatedTabId, info) => {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  await sleep(1500);
}

async function ensureScraperInjected(tabId) {
  try {
    await scriptingExecuteScript({
      target: { tabId },
      files: ['job-page-scraper.js'],
    });
  } catch (_err) {
    // The content script may already be present from manifest injection.
  }
}

async function sendScrapeMessage(tabId) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await tabsSendMessage(tabId, { type: 'SCRAPE_JOB_PAGE' });
      if (response?.ok && response.payload) return response.payload;
      throw new Error(response?.error || '页面脚本没有返回 JD。');
    } catch (err) {
      lastError = err;
      await sleep(1000);
    }
  }
  throw lastError || new Error('无法读取岗位页面。');
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `本地 API 返回 HTTP ${response.status}`);
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerExtension() {
  await fetch(LOCAL_EXTENSION_REGISTER_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version || '',
    }),
  }).catch(() => null);
}

async function initializeExtension() {
  await registerExtension();
  chrome.alarms.create(TASK_POLL_ALARM, { periodInMinutes: 0.5 });
  await pollTaskQueue();
}

async function pollTaskQueue() {
  if (isPollingTaskQueue) return;
  isPollingTaskQueue = true;
  try {
    await registerExtension();
    const claimed = await postJson(LOCAL_EXTENSION_CLAIM_API, {
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version || '',
    }).catch(() => null);
    if (!claimed?.task || !claimed?.job) return;
    try {
      const result = await parseJob(claimed.job);
      await postJson(LOCAL_EXTENSION_COMPLETE_API, {
        taskId: claimed.task.id,
        status: 'done',
        message: result?.message || 'Chrome 插件已解析并回写岗位。',
        output: '',
      }).catch(() => null);
    } catch (err) {
      await postJson(LOCAL_EXTENSION_COMPLETE_API, {
        taskId: claimed.task.id,
        status: 'failed',
        message: `Chrome 插件解析失败：${String(err?.message || err)}`,
        output: String(err?.stack || err || ''),
      }).catch(() => null);
    }
  } finally {
    isPollingTaskQueue = false;
  }
}

function tabsCreate(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function tabsGet(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function tabsRemove(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function tabsSendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function scriptingExecuteScript(injection) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(injection, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

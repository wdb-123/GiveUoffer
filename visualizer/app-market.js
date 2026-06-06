async function loadRecruitmentMarket() {
  if (currentView === 'market') setStatus('读取招聘信息');
  const data = await VisualizerApi.getRecruitmentMarket();
  renderRecruitmentMarket(data);
  if (currentView === 'market') setStatus('已更新');
}

async function runRecruitmentSearch(mode = 'experience') {
  const button = mode === 'resume-intent'
    ? document.querySelector('#marketResumeIntentSearchBtn')
    : document.querySelector('#marketExperienceSearchBtn') || document.querySelector('#marketSearchBtn') || document.querySelector('#marketRefreshBtn');
  const originalLabel = button?.textContent || '';
  if (button) button.disabled = true;
  if (button) button.textContent = mode === 'resume-intent' ? '意向检索中...' : '经历检索中...';
  setMarketSearchStatus(mode === 'resume-intent'
    ? '正在根据当前简历方向和求职意向检索岗位，通常需要 10-30 秒...'
    : '正在根据经历资产做粗泛岗位检索，通常需要 10-30 秒...');
  setStatus('搜索机会中');
  try {
    const result = await VisualizerApi.searchRecruitmentMarket({ mode, resumeFile: currentFile || resumeOptions[0]?.file || '' });
    renderRecruitmentMarket(result.market);
    setMarketSearchStatus(result.added
      ? `本次${mode === 'resume-intent' ? '根据简历和意向' : '根据经历'}新增 ${result.added} 条候选岗位，已合并到岗位列表；匹配评分仅作初筛，请打开来源复核 JD。`
      : `本次没有发现新的候选岗位；已为你过滤重复和低相关岗位。`);
    setStatus('已更新');
  } catch (err) {
    setMarketSearchStatus(`机会搜索失败：${err.message || err}`);
    setStatus('搜索失败');
  } finally {
    if (button) button.disabled = false;
    if (button && originalLabel) button.textContent = originalLabel;
  }
}

async function runDirectCrawler() {
  const button = document.querySelector('#marketCrawlerBtn');
  if (button) button.disabled = true;
  setMarketSearchStatus('正在搜索新的岗位机会，通常需要 30-90 秒...');
  setStatus('搜索机会中');
  try {
    const result = await VisualizerApi.crawlRecruitmentMarket();
    renderRecruitmentMarket(result.market);
    setMarketSearchStatus(result.added
      ? `本次新增 ${result.added} 条候选岗位，已合并到岗位列表；请打开来源复核 JD。`
      : `本次没有发现新的候选岗位；已为你跳过重复和不可用信息。`);
    setStatus('已更新');
  } catch (err) {
    setMarketSearchStatus(`机会搜索失败：${err.message || err}`);
    setStatus('搜索失败');
  } finally {
    if (button) button.disabled = false;
  }
}

function closeManualJobImport() {
  if (marketManualImportForm) marketManualImportForm.hidden = true;
}

function setMarketRailMode(mode = 'manual') {
  currentMarketRailMode = mode === 'radar' ? 'radar' : 'manual';
  marketRailModeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.marketRailMode === currentMarketRailMode);
  });
  document.querySelectorAll('[data-market-rail-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.marketRailPanel !== currentMarketRailMode;
  });
  if (currentMarketRailMode === 'manual') {
    if (marketManualImportForm) marketManualImportForm.hidden = false;
  }
  if (currentView === 'market') renderRecruitmentMarket(currentMarketData);
}

async function addManualRecruitmentJob() {
  const payload = Object.fromEntries(Object.entries(marketManualFields).map(([key, field]) => [key, field?.value?.trim() || '']));
  if (!payload.url && !payload.rawText && (!payload.company || !payload.role)) {
    setMarketSearchStatus('直接粘贴岗位链接即可；Boss 被拦截时可补粘 JD 正文。');
    return;
  }

  if (marketManualImportSubmitBtn) marketManualImportSubmitBtn.disabled = true;
  setMarketSearchStatus(payload.rawText ? '正在解析 JD 正文并记录...' : payload.url ? '正在解析岗位链接并导入...' : '正在导入你感兴趣的岗位...');
  try {
    const result = await VisualizerApi.addManualRecruitmentJob(payload);
    renderRecruitmentMarket(result.market);
    setMarketSearchStatus(result.message || (result.added ? '已记录岗位内容。' : '该岗位链接已存在。'));
    if (result.added) {
      Object.values(marketManualFields).forEach((field) => { if (field) field.value = ''; });
      if (marketManualImportForm) marketManualImportForm.hidden = false;
    }
    if (result.added && result.job && isPendingParsedJob(result.job)) {
      await runLocalCodexParseJob(result.job.id);
    }
    setStatus('已更新');
  } catch (err) {
    setMarketSearchStatus(`岗位导入失败：${err.message || err}`);
    setStatus('导入失败');
  } finally {
    if (marketManualImportSubmitBtn) marketManualImportSubmitBtn.disabled = false;
  }
}

async function deleteRecruitmentJob(id) {
  const job = (currentMarketData.jobs || []).find((item) => item.id === id);
  if (!job) {
    setMarketSearchStatus('没有找到要删除的岗位。');
    return;
  }
  const label = `${job.company || '待解析公司'} / ${job.role || '待解析岗位'}`;
  if (!window.confirm(`确认删除这个岗位？\n${label}`)) return;

  setMarketSearchStatus(`正在删除岗位：${label}`);
  try {
    const result = await VisualizerApi.deleteRecruitmentJob({ id });
    renderRecruitmentMarket(result.market);
    setMarketSearchStatus(result.message || '已删除岗位。');
    setStatus('已更新');
  } catch (err) {
    setMarketSearchStatus(`删除岗位失败：${err.message || err}`);
    setStatus('删除失败');
  }
}

async function toggleMarketPriorityFocus(id) {
  const job = (currentMarketData.jobs || []).find((item) => item.id === id);
  if (!job) {
    setMarketSearchStatus('没有找到要关注的岗位。');
    return;
  }
  const nextValue = !job.priorityFocus;
  setMarketSearchStatus(nextValue ? `正在标记重点关注：${job.company || ''} ${job.role || ''}`.trim() : '正在取消重点关注');
  try {
    const result = await VisualizerApi.updateRecruitmentJob({
      id,
      priorityFocus: nextValue,
    });
    renderRecruitmentMarket(result.market || currentMarketData);
    setMarketSearchStatus(result.message || (nextValue ? '已标记为重点关注。' : '已取消重点关注。'));
    setStatus('已更新');
  } catch (err) {
    setMarketSearchStatus(`重点关注更新失败：${err.message || err}`);
    setStatus('更新失败');
  }
}

async function runLocalCodexParseJob(id) {
  const job = (currentMarketData.jobs || []).find((item) => item.id === id);
  if (!job) {
    setMarketSearchStatus('没有找到要解析的岗位。');
    return;
  }
  currentCodexWorkflowState = { jobId: job.id || '', status: 'running', message: '正在拉起 Chrome 并等待插件解析，通常需要 10-30 秒。', output: '' };
  renderRecruitmentMarket(currentMarketData);
  setMarketSearchStatus(`正在启动 Chrome 解析任务：${job.id}`);
  setStatus('插件解析中');
  try {
    const result = await VisualizerApi.parseRecruitmentJobWithExtension({ id: job.id });
    if (result.task?.id) {
      currentCodexWorkflowState = {
        jobId: job.id || '',
        taskId: result.task.id,
        status: 'running',
        message: result.message || result.task.message || 'Chrome 解析任务已启动，等待扩展后台领取。',
        output: '',
      };
      renderRecruitmentMarket(currentMarketData);
      pollExtensionParseTask(result.task.id, job.id);
      return;
    }
    throw new Error(result.error || result.message || 'Chrome 解析任务启动失败。');
  } catch (extensionErr) {
    currentCodexWorkflowState = {
      jobId: job.id || '',
      status: 'running',
      message: `Chrome 插件不可用，改用本地 Codex 尝试解析：${extensionErr.message || extensionErr}`,
      output: '',
    };
    renderRecruitmentMarket(currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    await runLocalCodexParseJobFallback(job);
  }
}

async function pollExtensionParseTask(taskId, jobId, attempt = 0) {
  if (!taskId || attempt > 96) {
    currentCodexWorkflowState = { jobId, taskId, status: 'failed', message: 'Chrome 解析超时，请稍后重试。', output: '' };
    renderRecruitmentMarket(currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus('插件超时');
    return;
  }
  try {
    const result = await VisualizerApi.getExtensionParseTask({ taskId, jobId });
    const task = result.task;
    if (!task || task.status === 'running' || task.status === 'queued') {
      currentCodexWorkflowState = {
        jobId,
        taskId,
        status: 'running',
        message: task?.message || 'Chrome 解析中...',
        output: task?.output || '',
      };
      renderRecruitmentMarket(currentMarketData);
      setTimeout(() => pollExtensionParseTask(taskId, jobId, attempt + 1), 2000);
      return;
    }
    currentCodexWorkflowState = {
      jobId,
      taskId,
      status: task.status === 'done' ? 'done' : 'failed',
      message: task.message || 'Chrome 解析任务已结束。',
      output: task.output || '',
    };
    renderRecruitmentMarket(result.market || currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus(task.status === 'done' ? '已解析' : '解析未完成');
  } catch (err) {
    currentCodexWorkflowState = { jobId, taskId, status: 'failed', message: `查询 Chrome 解析任务失败：${err.message || err}`, output: '' };
    renderRecruitmentMarket(currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus('查询失败');
  }
}

async function runLocalCodexParseJobFallback(job) {
  try {
    const result = await VisualizerApi.parseRecruitmentJobWithCodex({ id: job.id });
    if (result.task?.id) {
      currentCodexWorkflowState = {
        jobId: job.id || '',
        taskId: result.task.id,
        status: 'running',
        message: result.message || result.task.message || '本地 Codex 解析任务已启动。',
        output: '',
      };
      renderRecruitmentMarket(currentMarketData);
      pollLocalCodexParseTask(result.task.id, job.id);
      return;
    }
    currentCodexWorkflowState = {
      jobId: job.id || '',
      status: result.parsed ? 'done' : 'failed',
      message: result.message || result.error || '本地 Codex 已执行。',
      output: result.codexOutput || '',
    };
    renderRecruitmentMarket(result.market || currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus(result.parsed ? '已解析' : '解析未完成');
  } catch (err) {
    currentCodexWorkflowState = { jobId: job.id || '', status: 'failed', message: `本地 Codex 调用失败：${err.message || err}`, output: '' };
    renderRecruitmentMarket(currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus('Codex 失败');
  }
}

async function pollLocalCodexParseTask(taskId, jobId, attempt = 0) {
  if (!taskId || attempt > 96) {
    currentCodexWorkflowState = { jobId, taskId, status: 'failed', message: '本地 Codex 解析超时，请稍后重试。', output: '' };
    renderRecruitmentMarket(currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus('Codex 超时');
    return;
  }
  try {
    const result = await VisualizerApi.getCodexParseTask({ taskId, jobId });
    const task = result.task;
    if (!task || task.status === 'running') {
      currentCodexWorkflowState = {
        jobId,
        taskId,
        status: 'running',
        message: task?.message || '本地 Codex 解析中...',
        output: task?.codexOutput || '',
      };
      renderRecruitmentMarket(currentMarketData);
      setTimeout(() => pollLocalCodexParseTask(taskId, jobId, attempt + 1), 5000);
      return;
    }
    currentCodexWorkflowState = {
      jobId,
      taskId,
      status: task.status === 'done' ? 'done' : 'failed',
      message: task.message || '本地 Codex 任务已结束。',
      output: task.codexOutput || '',
    };
    renderRecruitmentMarket(result.market || currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus(task.status === 'done' ? '已解析' : '解析未完成');
  } catch (err) {
    currentCodexWorkflowState = { jobId, taskId, status: 'failed', message: `查询 Codex 任务失败：${err.message || err}`, output: '' };
    renderRecruitmentMarket(currentMarketData);
    setMarketSearchStatus(currentCodexWorkflowState.message);
    setStatus('查询失败');
  }
}

function renderRecruitmentMarket(data) {
  currentMarketData = data || { jobs: [] };
  renderResumeTargetJobOptions(currentMarketData.jobs || []);
  const allJobs = data.jobs || [];
  const railScopedJobs = allJobs.filter((job) => (
    currentMarketRailMode === 'radar' ? !isManualMarketJob(job) : isManualMarketJob(job)
  ));
  syncMarketFilterOptions(railScopedJobs);
  const minScore = Number(marketMinScoreSelect?.value || 0);
  const jobs = sortMarketJobs(
    railScopedJobs.filter((job) => {
      if (Number(job.matchScore || 0) < minScore) return false;
      const matchThreshold = Number(marketMatchFilter?.value || 0);
      if (matchThreshold && Number(job.matchScore || 0) < matchThreshold) return false;
      if (marketCompanyTypeFilter?.value && inferCompanyType(job) !== marketCompanyTypeFilter.value) return false;
      if (marketDirectionFilter?.value && String(job.direction || '') !== marketDirectionFilter.value) return false;
      if (marketSalaryFilter?.value && salaryBucket(job.salary) !== marketSalaryFilter.value) return false;
      if (marketLocationFilter?.value && inferLocationBucket(job) !== marketLocationFilter.value) return false;
      if (marketSearchInput?.value?.trim()) {
        const query = marketSearchInput.value.trim().toLowerCase();
        const haystack = [
          job.company,
          job.role,
          job.direction,
          job.salary,
          platformLabel(job),
          ...(job.keywords || []),
          job.fitReason,
          job.evidenceGap,
        ].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    }),
    marketSortSelect?.value || 'score-desc',
  );
  if (marketMetrics) marketMetrics.innerHTML = '';

  renderMarketChannelStatus(data);
  renderOfficialCompanySearch(jobs);
  renderPlatformMatrix(data);
  marketJobs.innerHTML = jobs.length
    ? renderMarketGroups(jobs, marketGroupSelect?.value || 'flat')
    : `<div class="empty-state">${currentMarketRailMode === 'radar' ? '暂无雷达搜索岗位。' : '暂无手工导入岗位。'}</div>`;
}

function renderResumeTargetJobOptions(jobs = []) {
  if (!resumeTargetJobSelect) return;
  const previous = resumeTargetJobSelect.value;
  const validJobs = jobs
    .filter((job) => job?.id && job.role && !/待解析|待复核岗位/.test(`${job.company || ''}${job.role || ''}`))
    .sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0))
    .slice(0, 80);
  resumeTargetJobSelect.innerHTML = validJobs.length
    ? validJobs.map((job) => {
        const label = `${job.company || '待确认公司'} - ${job.role || '待确认岗位'}${job.matchScore ? ` · ${Number(job.matchScore).toFixed(1)}` : ''}`;
        return `<option value="${escapeAttr(job.id)}">${escapeHtml(label)}</option>`;
      }).join('')
    : '<option value="">暂无可选岗位</option>';
  const remembered = readRememberedResumeTargetJob();
  const selected = [previous, remembered, validJobs[0]?.id].find((id) => id && validJobs.some((job) => job.id === id));
  if (selected) {
    resumeTargetJobSelect.value = selected;
    rememberResumeTargetJob(selected);
    currentResumeTargetJobId = selected;
  }
  syncSelectedTargetResumeState({ loadExisting: currentView === 'resume' });
}

function rememberResumeTargetJob(jobId = '') {
  if (!jobId) return;
  currentResumeTargetJobId = jobId;
  try {
    localStorage.setItem('careerOpsResumeTargetJobId', jobId);
  } catch (err) {
    // Ignore private browsing or storage-disabled environments.
  }
}

async function syncSelectedTargetResumeState({ loadExisting = true } = {}) {
  if (!resumeTargetJobSelect || currentView !== 'resume') return;
  const jobId = resumeTargetJobSelect.value || currentResumeTargetJobId || '';
  if (!jobId) return;
  currentResumeTargetJobId = jobId;
  const job = (currentMarketData.jobs || []).find((item) => item.id === jobId);
  const link = resumeJobLinks.find((item) => item.jobId === jobId && item.file);
  if (link?.file && resumeOptions.some((item) => item.file === link.file)) {
    if (loadExisting && (currentFile !== link.file || paper?.dataset.resumeState !== 'loaded')) {
      setResumeGenerationStatus('');
      await loadResume(link.file);
    } else {
      setResumeGenerationStatus('');
    }
    return;
  }
  if (job) renderTargetResumeState(job);
}

function readRememberedResumeTargetJob() {
  try {
    return localStorage.getItem('careerOpsResumeTargetJobId') || '';
  } catch (err) {
    return '';
  }
}

function marketSummaryItem(label, value, hint) {
  return `
    <span class="market-summary-item">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(hint)}</small>
    </span>
  `;
}

function renderPlatformMatrix(data) {
  const platforms = data.platforms || [];
  if (!marketChannelList) return;
  marketChannelList.innerHTML = platforms.length
    ? platforms.map(renderPlatformCard).join('')
    : '<div class="empty-state">还没有配置招聘渠道。</div>';
}

function renderOfficialCompanySearch(jobs) {
  if (!officialCompanyList) return;
  const suggestions = officialCompanySuggestions(jobs, marketProfileTerms());
  officialCompanyList.innerHTML = suggestions.length
    ? suggestions.map(renderOfficialCompanyItem).join('')
    : '<div class="empty-state">暂无可推荐的官网搜索入口。</div>';
}

function officialCompanySuggestions(jobs, profileTerms = []) {
  const byCompany = new Map();
  for (const job of jobs) {
    const company = String(job.company || '').trim();
    if (!company || company.includes('猎头') || company.includes('公司（')) continue;
    const current = byCompany.get(company);
    if (!current || Number(job.matchScore || 0) > Number(current.matchScore || 0)) {
      byCompany.set(company, job);
    }
  }

  const ranked = [...byCompany.values()]
    .sort((a, b) => officialCompanyScore(b, profileTerms) - officialCompanyScore(a, profileTerms))
    .slice(0, 5)
    .map((job) => ({
      company: job.company,
      direction: job.direction || '机器人 / AI 工具链',
      score: officialCompanyScore(job, profileTerms),
      query: officialSearchQuery(job.company, job, profileTerms),
    }));

  const fallbackCompanies = [
    ['智元机器人', '机器人系统 / AI 工具链'],
    ['腾讯', 'RAG / Agent / AI 平台'],
    ['优必选', '具身智能 / 机器人软件'],
    ['宇树科技', '机器人感知 / 数据平台'],
    ['速腾聚创', '机器人感知 / 数据平台'],
  ];

  for (const [company, direction] of fallbackCompanies) {
    if (ranked.some((item) => item.company === company)) continue;
    ranked.push({
      company,
      direction,
      score: 0,
      query: officialSearchQuery(company, { direction, keywords: [] }, profileTerms),
    });
    if (ranked.length >= 7) break;
  }
  return ranked.slice(0, 7);
}

function marketProfileTerms() {
  const resumeFile = currentFile || resumeOptions[0]?.file || '';
  const selectedResume = resumeOptions.find((item) => item.file === resumeFile);
  const clues = directionClues?.[resumeFile] || {};
  return uniqueMarketTerms([
    selectedResume?.title,
    clues.direction,
    clues.strategy,
    ...(clues.jdSignals || []),
    ...(clues.keywords || []),
    ...currentExperienceFiles.flatMap((item) => [item.title, item.name, item.content]),
    ...currentIntentions.flatMap((item) => [item.title, item.name, item.content]),
  ]).slice(0, 12);
}

function officialCompanyScore(job, profileTerms = []) {
  const base = Number(job.matchScore || 0);
  const text = [
    job.company,
    job.role,
    job.direction,
    ...(job.keywords || []),
    job.fitReason,
    job.evidenceGap,
  ].filter(Boolean).join(' ').toLowerCase();
  const hits = profileTerms.filter((term) => text.includes(term.toLowerCase())).length;
  return Number((base + Math.min(hits, 5) * 0.12).toFixed(1));
}

function officialSearchQuery(company, job, profileTerms = []) {
  const keywords = [
    company,
    '官网招聘',
    job.direction,
    ...(job.keywords || []).slice(0, 2),
    ...profileTerms.slice(0, 3),
    '深圳',
  ].filter(Boolean);
  return keywords.join(' ');
}

function uniqueMarketTerms(values) {
  const seen = new Set();
  return values.flatMap((value) => String(value || '').split(/[\s,，、/|：:()（）【】\[\]\n]+/))
    .map((item) => item.trim())
    .filter((item) => item && item.length >= 2 && !/^(韦东波|简历|岗位|招聘|官网|深圳|文件)$/.test(item))
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function officialSearchUrl(query) {
  return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
}

function renderOfficialCompanyItem(item) {
  return `
    <a class="official-company-item" href="${escapeAttr(officialSearchUrl(item.query))}" target="_blank" rel="noreferrer">
      <strong>${escapeHtml(item.company)}</strong>
      <span>${escapeHtml(item.direction)}</span>
      ${item.score ? `<small>${item.score.toFixed(1)} 匹配线索</small>` : '<small>重点官网入口</small>'}
    </a>
  `;
}

function renderPlatformCard(platform) {
  const status = platform.status || 'todo';
  const priority = platform.priority || 'P2';
  const tags = [
    platform.segment,
  ].filter(Boolean);
  const reached = status === 'active' || status === 'configured';
  return `
    <article class="platform-card status-${escapeAttr(status)}">
      <div class="platform-card-head">
        <strong>${escapeHtml(platform.name)}</strong>
        <span class="priority-pill">${escapeHtml(priority)}</span>
      </div>
      <div class="platform-meta">
        ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
      </div>
      <div class="channel-status-row">
        <span class="channel-touch-state ${reached ? 'is-reached' : 'is-unreached'}">${escapeHtml(platformTouchLabel(status))}</span>
        <small>${escapeHtml(platformFallbackAction(status))}</small>
      </div>
      <a href="${escapeAttr(platform.searchUrl || '#')}" target="_blank" rel="noreferrer">打开渠道</a>
    </article>
  `;
}

function platformTouchLabel(status) {
  if (status === 'active') return '已触达';
  if (status === 'configured') return '可查看';
  if (status === 'login') return '需登录';
  if (status === 'todo') return '待接入';
  if (status === 'optional') return '低优先级';
  return status || '待接入';
}

function platformFallbackAction(status) {
  if (status === 'login') return '该渠道需要先登录后再查看候选岗位。';
  if (status === 'todo') return '该渠道暂未准备好，先关注已触达渠道。';
  if (status === 'optional') return '低频渠道，按需查看。';
  return '已纳入岗位雷达，优先查看高匹配岗位。';
}

function renderMarketChannelStatus(data) {
  if (!data.platforms?.length) return;
  if (!marketSearchStatus) return;
  if (!marketSearchStatus.textContent) marketSearchStatus.hidden = true;
}

function setMarketSearchStatus(message) {
  if (marketSearchStatus) {
    marketSearchStatus.textContent = message || '';
    marketSearchStatus.hidden = true;
  }
  if (currentView === 'market') setStatus(message);
}

function sortMarketJobs(jobs, sortMode) {
  const list = [...jobs];
  const byScore = (a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0);
  if (sortMode === 'salary-desc') {
    return list.sort((a, b) => salaryValue(b.salary) - salaryValue(a.salary) || byScore(a, b));
  }
  if (sortMode === 'newest') {
    return list.sort((a, b) => marketIdNumber(b.id) - marketIdNumber(a.id));
  }
  if (sortMode === 'company') {
    return list.sort((a, b) => String(a.company || '').localeCompare(String(b.company || ''), 'zh-Hans') || byScore(a, b));
  }
  return list.sort(byScore);
}

function renderMarketGroups(jobs, groupMode) {
  return renderMarketTable(jobs);
}

function renderSourceKindColumns(manualJobs, radarJobs) {
  if (currentMarketRailMode === 'radar') {
    return renderMarketSourcePage({
      title: '雷达搜索岗位',
      subtitle: '自动搜索 / 渠道采集 / 初筛候选',
      jobs: radarJobs,
      emptyText: '暂无雷达搜索岗位。',
      kind: 'radar',
    });
  }
  return renderMarketSourcePage({
    title: '手工导入岗位',
    subtitle: '我喜欢 / 别人推荐 / 平台外看到',
    jobs: manualJobs,
    emptyText: '还没有手工导入岗位。右侧只贴链接并解析后，会优先显示在这里。',
    kind: 'manual',
  });
}

function renderMarketSourcePage({ title, subtitle, jobs, emptyText, kind }) {
  return `
    <section class="market-source-page source-${escapeAttr(kind)}">
      <div class="market-source-column-head">
        <div>
          <h4>${escapeHtml(title)}</h4>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <strong>${jobs.length} 个岗位</strong>
      </div>
      <div class="market-source-card-list">
        ${jobs.length ? jobs.map(renderMarketSourceCard).join('') : `<div class="empty-state">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>
  `;
}

function renderMarketSourceCard(job) {
  const isPending = isPendingParsedJob(job);
  const canOpen = Boolean(job.url);
  const metaItems = [
    cleanMarketMeta(job.location, ['待复核', '地点待复核']),
    cleanMarketMeta(job.salary, ['待复核', '薪资未披露']),
    platformLabel(job),
  ].filter(Boolean);
  const reason = isPending ? '' : (job.fitReason || job.evidenceGap || job.direction || '需要打开 JD 后复核。');
  const tags = isPending ? '' : renderMiniTags(job.keywords || []);
  return `
    <article class="market-source-card${isPending ? ' is-pending-parse' : ''}${canOpen ? ' is-clickable' : ''}"${canOpen ? ` data-market-open-url="${escapeAttr(job.url)}" data-market-job-id="${escapeAttr(job.id || '')}" tabindex="0" role="link"` : ''}>
      <div class="market-source-card-head">
        <strong>${escapeHtml(job.company || '待复核')}</strong>
        <div class="market-source-card-actions">
          <span class="market-source-score">${Number(job.matchScore || 0).toFixed(1)}</span>
          ${isPending ? '' : renderMarketFocusButton(job)}
          ${renderMarketDeleteButton(job)}
        </div>
      </div>
      ${isPending ? renderPendingMarketJobTitle(job) : renderMarketJobTitle(job)}
      ${metaItems.length ? `
        <div class="market-source-card-meta">
          ${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      ` : ''}
      ${isPending ? renderPendingMarketCallout(job) : ''}
      ${reason ? `<p>${escapeHtml(reason)}</p>` : ''}
      ${tags}
    </article>
  `;
}

function isPendingParsedJob(job) {
  return /待解析/.test(`${job.company || ''} ${job.role || ''}`) || /blocked|failed|fallback/.test(String(job.parseStatus || ''));
}

function cleanMarketMeta(value, placeholders = []) {
  const text = String(value || '').trim();
  if (!text || placeholders.includes(text)) return '';
  return text;
}

function renderPendingMarketJobTitle(job) {
  return `<span class="market-pending-title">${escapeHtml(job.role || '待解析岗位')}</span>`;
}

function renderPendingMarketCallout(job) {
  const workflow = currentCodexWorkflowState.jobId === job.id ? currentCodexWorkflowState : null;
  const isBusy = workflow?.status === 'running';
  return `
    <div class="market-pending-callout">
      <strong>下一步：解析这条岗位</strong>
      <span>点击后任务会进入本地队列，由 Chrome 扩展后台自动领取、打开岗位链接、读取已登录页面并回写这张卡片。</span>
      <div class="market-pending-actions">
        <button class="market-codex-workflow-button${isBusy ? ' is-running' : ''}" type="button" data-market-codex-job="${escapeAttr(job.id || '')}" ${isBusy ? 'disabled' : ''}>${isBusy ? '插件解析中...' : 'Chrome 插件解析'}</button>
        ${renderMarketJobJump(job, '打开链接')}
      </div>
      ${workflow ? renderCodexWorkflowFeedback(workflow) : ''}
    </div>
  `;
}

function renderCodexWorkflowFeedback(workflow) {
  if (workflow.status === 'failed') {
    return `
      <div class="market-workflow-feedback is-error">
        <strong>${escapeHtml(workflow.message || '本地 Codex 解析未完成。')}</strong>
        ${workflow.output ? `<textarea readonly rows="5">${escapeHtml(workflow.output)}</textarea>` : ''}
      </div>
    `;
  }
  if (workflow.status === 'running') {
    return `
      <div class="market-workflow-feedback is-running">
        ${escapeHtml(workflow.message || '本地 Codex 正在解析并回写。')}
      </div>
    `;
  }
  return `
    <div class="market-workflow-feedback">
      ${escapeHtml(workflow.message || '本地 Codex 已执行。')}
    </div>
  `;
}

function renderMarketGroupSection(title, groupJobs, emptyText = '暂无岗位。') {
  return `
    <section class="market-group">
      <div class="market-group-head">
        <h4>${escapeHtml(title)}</h4>
        <span>${groupJobs.length} 个岗位</span>
      </div>
      ${groupJobs.length ? renderMarketTable(groupJobs) : `<div class="empty-state">${escapeHtml(emptyText)}</div>`}
    </section>
  `;
}

function marketGroupKey(job, groupMode) {
  if (groupMode === 'source-kind') {
    return isManualMarketJob(job)
      ? '手工导入岗位 / 我感兴趣'
      : '雷达搜索岗位 / 自动发现';
  }
  if (groupMode === 'channel') return platformLabel(job);
  if (groupMode === 'score') {
    const score = Number(job.matchScore || 0);
    if (score >= 4) return '重点匹配 4.0+';
    if (score >= 3.5) return '可跟进 3.5-3.9';
    if (score >= 3) return '观察 3.0-3.4';
    return '暂不主投 <3.0';
  }
  if (groupMode === 'salary') {
    const value = salaryValue(job.salary);
    if (value >= 45) return '高薪 45K+';
    if (value >= 35) return '目标薪资 35K-45K';
    if (value > 0) return '低于目标 / 待判断';
    return '薪资未披露';
  }
  return job.direction || '未分类方向';
}

function renderMarketTable(jobs) {
  return `
    <table>
      <colgroup>
        <col class="market-col-role">
        <col class="market-col-score">
        <col class="market-col-source">
        <col class="market-col-summary">
        <col class="market-col-action">
      </colgroup>
      <thead>
        <tr>
          <th>岗位</th>
          <th>初筛 / 薪资</th>
          <th>来源</th>
          <th>为什么值得看</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${jobs.map((job) => `
          <tr${job.url ? ` class="market-row-link" data-market-open-url="${escapeAttr(job.url)}" data-market-job-id="${escapeAttr(job.id || '')}" tabindex="0" role="link"` : ''}>
            <td class="market-job-cell">
              <strong>${escapeHtml(job.company)}</strong>
              ${renderMarketJobTitle(job)}
              <small>${escapeHtml([job.id, compactMarketMeta(job, true)].filter(Boolean).join(' · '))}</small>
            </td>
            <td class="market-score-cell">
              <span class="score-badge">${Number(job.matchScore || 0).toFixed(1)}</span>
              <span class="salary-badge">${escapeHtml(displaySalary(job.salary))}</span>
            </td>
            <td class="market-source-cell">
              <span>${escapeHtml(platformLabel(job))}</span>
              <small>${escapeHtml(marketStoredAt(job))}</small>
            </td>
            <td class="market-reason-cell"><div class="market-summary-text">${escapeHtml(job.fitReason || job.evidenceGap || job.direction || '')}</div></td>
            <td class="market-action-cell">${renderMarketTableActions(job)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderMarketTableActions(job) {
  const workflow = currentCodexWorkflowState.jobId === job.id ? currentCodexWorkflowState : null;
  const isBusy = workflow?.status === 'running';
  const parseButton = isPendingParsedJob(job) && job.url
    ? `<button class="market-codex-workflow-button table-parse-button${isBusy ? ' is-running' : ''}" type="button" data-market-codex-job="${escapeAttr(job.id || '')}" ${isBusy ? 'disabled' : ''}>${isBusy ? '解析中' : '解析'}</button>`
    : '';
  return `
    <div class="market-table-actions">
      ${isPendingParsedJob(job) ? '' : renderMarketFocusButton(job)}
      ${parseButton}
      ${renderMarketDeleteButton(job, '删除')}
    </div>
  `;
}

function renderMarketResumeButton(job, label = '生成简历') {
  if (!job?.id || !job.role || /待解析|待复核岗位/.test(`${job.company || ''}${job.role || ''}`)) return '';
  const isBusy = currentResumeGenerationJobId === job.id;
  return `<button class="market-generate-resume-button${isBusy ? ' is-running' : ''}" type="button" data-market-generate-resume="${escapeAttr(job.id)}" ${isBusy ? 'disabled' : ''}>${escapeHtml(isBusy ? '生成中' : label)}</button>`;
}

function renderMarketFocusButton(job) {
  if (!job?.id || !job.role || /待解析|待复核岗位/.test(`${job.company || ''}${job.role || ''}`)) return '';
  const isFocused = Boolean(job.priorityFocus);
  return `<button class="market-focus-button${isFocused ? ' is-focused' : ''}" type="button" data-market-priority-focus="${escapeAttr(job.id)}">${escapeHtml(isFocused ? '已关注' : '重点关注')}</button>`;
}

function displaySalary(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '未披露';
  return text
    .replace(/^AI估算[:：]?\s*/i, '')
    .replace(/^AI estimate[:：]?\s*/i, '')
    .trim() || '未披露';
}

function syncMarketFilterOptions(jobs) {
  syncSelectOptions(marketCompanyTypeFilter, [
    { value: '', label: '全部类型' },
    ...uniqueMarketTerms(jobs.map((job) => inferCompanyType(job))).map((value) => ({ value, label: value })),
  ]);
  syncSelectOptions(marketDirectionFilter, [
    { value: '', label: '全部方向' },
    ...uniqueMarketTerms(jobs.map((job) => job.direction)).map((value) => ({ value, label: value })),
  ]);
  syncSelectOptions(marketSalaryFilter, [
    { value: '', label: '全部薪资' },
    { value: '45+', label: '45K+' },
    { value: '35-45', label: '35K-45K' },
    { value: '25-35', label: '25K-35K' },
    { value: '<25', label: '25K 以下' },
    { value: 'hidden', label: '未披露' },
  ]);
  syncSelectOptions(marketMatchFilter, [
    { value: '', label: '全部匹配' },
    { value: '4', label: '4.0+' },
    { value: '3.5', label: '3.5+' },
    { value: '3', label: '3.0+' },
  ]);
  syncSelectOptions(marketLocationFilter, [
    { value: '', label: '全部地点' },
    ...uniqueMarketTerms(jobs.map((job) => inferLocationBucket(job))).map((value) => ({ value, label: value })),
  ]);
}

function syncSelectOptions(select, options) {
  if (!select) return;
  const previous = select.value;
  const html = options.map((option) => `<option value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</option>`).join('');
  if (select.innerHTML !== html) select.innerHTML = html;
  if (options.some((option) => option.value === previous)) select.value = previous;
}

function renderMarketDeleteButton(job, label = '') {
  if (!job.id) return '';
  return `<button class="market-delete-job-button" type="button" data-market-delete-job="${escapeAttr(job.id)}" title="删除岗位" aria-label="删除岗位">×</button>`;
}

function isManualMarketJob(job) {
  return job.discoveredBy === 'manual-import' || Boolean(job.manualInterest);
}

function renderMarketJobTitle(job) {
  const role = escapeHtml(job.role);
  if (!job.url) return `<span>${role}</span>`;
  return `<a class="market-job-title-link" href="${escapeAttr(job.url)}" target="_blank" rel="noreferrer">${role}</a>`;
}

function renderMarketJobJump(job, label = '直达岗位') {
  if (!job.url) return '';
  return `<a class="market-job-jump" href="${escapeAttr(job.url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function renderContactCell(job) {
  const email = job.applicationEmail || job.contactEmails?.[0] || '';
  const method = job.contactMethod || (email ? '邮箱投递' : '平台沟通');
  if (email) {
    return `
      <div class="contact-cell has-email">
        <a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a>
        <small>${escapeHtml(method)}</small>
      </div>
    `;
  }
  return `
    <div class="contact-cell">
      <span>${escapeHtml(method)}</span>
    </div>
  `;
}

function compactMarketMeta(job, includeDirection = false) {
  return [
    job.location,
    platformLabel(job),
    job.contactMethod || '',
    includeDirection ? job.direction || '' : '',
  ].filter(Boolean).join(' · ');
}

function platformLabel(job) {
  const text = `${job.platform || ''} ${job.source || ''} ${job.url || ''}`.toLowerCase();
  if (text.includes('zhipin') || text.includes('boss')) return 'Boss 直聘';
  if (text.includes('maimai')) return '脉脉';
  if (text.includes('liepin') || text.includes('猎聘')) return '猎聘';
  if (text.includes('zhaopin') || text.includes('智联')) return '智联招聘';
  if (text.includes('lagou') || text.includes('拉勾')) return '拉勾';
  if (text.includes('jobs.tencent') || text.includes('腾讯招聘')) return '公司官网';
  if (text.includes('michaelpage')) return '猎头 / Michael Page';
  if (text.includes('haitou') || text.includes('simplyhired') || text.includes('bebee') || text.includes('watchjobs')) return '聚合转载';
  return job.source || '其他渠道';
}

function inferCompanyType(job) {
  const text = `${job.company || ''} ${job.rawText || ''} ${job.source || ''} ${job.platform || ''}`.toLowerCase();
  if (/猎头|michael page|headhunter/.test(text)) return '猎头 / 中介';
  if (/国企|央企|研究院|实验室|科学院|大学/.test(text)) return '国企 / 研究院';
  if (/上市|腾讯|字节|阿里|华为|比亚迪|京东|美团/.test(text)) return '大厂 / 上市公司';
  if (/天使轮|pre-a|a轮|b轮|c轮|种子轮/.test(text)) return '创业公司';
  if (/机器人|人工智能|具身智能/.test(text)) return '科技公司';
  return '其他';
}

function salaryBucket(raw) {
  const value = salaryValue(raw);
  if (!value) return 'hidden';
  if (value >= 45) return '45+';
  if (value >= 35) return '35-45';
  if (value >= 25) return '25-35';
  return '<25';
}

function marketStoredAt(job) {
  const value = job.importedAt
    || String(job.discoveredAt || '').slice(0, 10)
    || String(job.discoveredAtChina || '').slice(0, 10)
    || String(job.updatedAt || '').slice(0, 10)
    || currentMarketData.updatedAt
    || '';
  return String(value || '').slice(0, 10);
}

function inferLocationBucket(job) {
  const text = String(job.location || '').trim();
  if (!text) return '未标注';
  if (text.includes('深圳')) return '深圳';
  if (text.includes('北京')) return '北京';
  if (text.includes('上海')) return '上海';
  if (text.includes('杭州')) return '杭州';
  if (text.includes('广州')) return '广州';
  if (text.includes('苏州')) return '苏州';
  return text;
}

function salaryValue(raw) {
  const value = String(raw || '');
  const range = value.match(/(\d{2,3})\s*[kK]\s*[-~－]\s*(\d{2,3})\s*[kK]/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const cnRange = value.match(/(\d{2,3})\s*-\s*(\d{2,3})K/i);
  if (cnRange) return (Number(cnRange[1]) + Number(cnRange[2])) / 2;
  const single = value.match(/(\d{2,3})\s*[kK]/);
  if (single) return Number(single[1]);
  return 0;
}

function marketIdNumber(id) {
  return Number(String(id || '').match(/\d+/)?.[0] || 0);
}

function renderMiniTags(items) {
  return `<div class="mini-tags">${items.slice(0, 6).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

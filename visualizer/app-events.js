document.querySelectorAll('[data-export-format]').forEach((button) => {
  button.addEventListener('click', () => exportResume(button.dataset.exportFormat));
});
autoGenerateResumeBtn?.addEventListener('click', autoGenerateResume);
resumeTargetJobSelect?.addEventListener('change', async () => {
  rememberResumeTargetJob(resumeTargetJobSelect.value);
  await syncSelectedTargetResumeState({ loadExisting: true });
});
document.querySelector('#refreshBtn')?.addEventListener('click', () => loadResume(currentFile));
docTitleButton?.addEventListener('click', toggleResumeTitleMenu);
document.addEventListener('click', closeResumeTitleMenuOnOutside);
document.querySelector('#applicationsRefreshBtn')?.addEventListener('click', loadApplications);
applicationParseBtn?.addEventListener('click', parseApplicationImport);
applicationClearImportBtn?.addEventListener('click', clearApplicationImport);
document.querySelectorAll('[data-import-source]').forEach((button) => {
  button.addEventListener('click', () => setApplicationImportSource(button.dataset.importSource));
});
document.querySelector('#marketRefreshBtn')?.addEventListener('click', () => runRecruitmentSearch('experience'));
document.querySelector('#marketSearchBtn')?.addEventListener('click', () => runRecruitmentSearch('experience'));
document.querySelector('#marketExperienceSearchBtn')?.addEventListener('click', () => runRecruitmentSearch('experience'));
document.querySelector('#marketResumeIntentSearchBtn')?.addEventListener('click', () => runRecruitmentSearch('resume-intent'));
document.querySelector('#marketCrawlerBtn')?.addEventListener('click', runDirectCrawler);
marketRailModeButtons.forEach((button) => {
  button.addEventListener('click', () => setMarketRailMode(button.dataset.marketRailMode));
});
marketManualImportCancelBtn?.addEventListener('click', closeManualJobImport);
marketManualImportForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  addManualRecruitmentJob();
});
marketJobs?.addEventListener('click', (event) => {
  const focusButton = event.target.closest('[data-market-priority-focus]');
  if (focusButton) {
    toggleMarketPriorityFocus(focusButton.dataset.marketPriorityFocus || '');
    return;
  }
  const generateButton = event.target.closest('[data-market-generate-resume]');
  if (generateButton) {
    rememberResumeTargetJob(generateButton.dataset.marketGenerateResume || '');
    autoGenerateResume(generateButton.dataset.marketGenerateResume || '');
    return;
  }
  const workflowButton = event.target.closest('[data-market-codex-job]');
  if (workflowButton) {
    runLocalCodexParseJob(workflowButton.dataset.marketCodexJob);
    return;
  }
  const button = event.target.closest('[data-market-delete-job]');
  if (button) {
    deleteRecruitmentJob(button.dataset.marketDeleteJob);
    return;
  }
  const skipCardOpen = event.target.closest('a, button, textarea, input, select, label');
  if (skipCardOpen) return;
  const card = event.target.closest('[data-market-open-url]');
  if (!card?.dataset.marketOpenUrl) return;
  const rowJob = (currentMarketData.jobs || []).find((item) => item.id === card.dataset.marketJobId);
  if (rowJob?.id) rememberResumeTargetJob(rowJob.id);
  if (event.metaKey || event.ctrlKey) {
    window.open(card.dataset.marketOpenUrl, '_blank', 'noopener');
    return;
  }
  if (rowJob && isPendingParsedJob(rowJob)) {
    runLocalCodexParseJob(rowJob.id);
    return;
  }
  window.location.href = card.dataset.marketOpenUrl;
});
marketJobs?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-market-open-url]');
  if (!card?.dataset.marketOpenUrl) return;
  const skipCardOpen = event.target.closest('a, button, textarea, input, select, label');
  if (skipCardOpen) return;
  event.preventDefault();
  const rowJob = (currentMarketData.jobs || []).find((item) => item.id === card.dataset.marketJobId);
  if (rowJob?.id) rememberResumeTargetJob(rowJob.id);
  if (rowJob && isPendingParsedJob(rowJob)) {
    runLocalCodexParseJob(rowJob.id);
    return;
  }
  window.location.href = card.dataset.marketOpenUrl;
});
marketGroupSelect?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketSortSelect?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketMinScoreSelect?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketCompanyTypeFilter?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketDirectionFilter?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketSalaryFilter?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketMatchFilter?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketLocationFilter?.addEventListener('change', () => renderRecruitmentMarket(currentMarketData));
marketSearchInput?.addEventListener('input', () => renderRecruitmentMarket(currentMarketData));
document.querySelector('#evidenceRefreshBtn')?.addEventListener('click', loadEvidenceRequests);
aiButlerNewChatBtn?.addEventListener('click', () => {
  if (typeof createAiConversation === 'function') createAiConversation();
});
aiChatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (typeof sendAiMessage === 'function') sendAiMessage(aiChatInput.value);
  aiChatInput.value = '';
});
document.querySelectorAll('[data-ai-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    if (typeof sendAiMessage === 'function') sendAiMessage(button.dataset.aiPrompt);
  });
});
document.querySelector('#replyRefreshBtn')?.addEventListener('click', loadReplyDrafts);
document.querySelector('#experienceRefreshBtn')?.addEventListener('click', loadExperienceMetadata);
experienceProfileGenerateBtn?.addEventListener('click', generateExperienceProfile);
experienceSaveBtn?.addEventListener('click', saveExperienceMetadata);
document.querySelector('#experienceImportBtn')?.addEventListener('click', () => {
  document.querySelector('.experience-import-menu').open = false;
  experienceImportInput?.click();
});
document.querySelector('#headshotImportBtn')?.addEventListener('click', () => {
  document.querySelector('.experience-import-menu').open = false;
  headshotImportInput?.click();
});
document.querySelector('#intentionImportBtn')?.addEventListener('click', () => {
  document.querySelector('.experience-import-menu').open = false;
  intentionImportInput.click();
});
experienceImportInput?.addEventListener('change', importExperienceFiles);
headshotImportInput?.addEventListener('change', importHeadshotFiles);
intentionImportInput?.addEventListener('change', importIntentionFiles);
Object.values(experienceFields).forEach((field) => {
  field?.addEventListener('input', () => {
    if (currentView === 'experience') experienceStatus.textContent = '有未保存的元数据修改。';
  });
});
experienceViewBtn?.addEventListener('click', () => switchView('experience'));
resumeViewBtn?.addEventListener('click', () => switchView('resume'));
marketViewBtn?.addEventListener('click', () => switchView('market'));
applicationsViewBtn?.addEventListener('click', () => switchView('applications'));
replyViewBtn?.addEventListener('click', () => switchView('reply'));
evidenceViewBtn?.addEventListener('click', () => switchView('evidence'));
resumeSelect?.addEventListener('change', () => loadResume(resumeSelect.value));
templateSelect?.addEventListener('change', applyTemplate);
densitySelect?.addEventListener('change', applyTemplate);
resumeTemplateImportBtn?.addEventListener('click', () => resumeTemplateImportInput?.click());
resumeTemplateImportInput?.addEventListener('change', importResumeTemplate);
editPreviewBtn?.addEventListener('click', toggleRenderedEditMode);
savePreviewBtn?.addEventListener('click', saveRenderedEdits);
saveResumeVersionBtn?.addEventListener('click', saveResumeVersion);
resumeVersionSelect?.addEventListener('change', () => {
  if (restoreResumeVersionBtn) restoreResumeVersionBtn.disabled = !resumeVersionSelect.value;
});
restoreResumeVersionBtn?.addEventListener('click', restoreResumeVersion);
paper?.addEventListener('dblclick', enableRenderedInlineEditing);
paper?.addEventListener('pointerdown', handleResumeDeckPointerDown);
paper?.addEventListener('pointermove', handleResumeDeckPointerMove);
paper?.addEventListener('pointerup', handleResumeDeckPointerUp);
paper?.addEventListener('pointercancel', handleResumeDeckPointerCancel);
document.addEventListener('keydown', handleResumeDeckKeydown);
window.addEventListener('resize', scheduleResumeToolbarSync);
resumeView?.addEventListener('scroll', scheduleResumeToolbarSync);
paper?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-generate-target-resume]');
  if (!button) return;
  autoGenerateResume(button.dataset.generateTargetResume || '');
});
document.querySelectorAll('.resource-link').forEach((button) => {
  button.addEventListener('click', () => openResource(button.dataset.resource));
});
resourceCloseBtn?.addEventListener('click', closeResourceEditor);
resourceSaveBtn?.addEventListener('click', saveResource);
resourceText?.addEventListener('input', () => renderResourcePreview(currentResourcePath, resourceText.value));
replyGenerateBtn?.addEventListener('click', createReplyDraft);
document.querySelectorAll('.context-mode-button').forEach((button) => {
  button.addEventListener('click', () => setContextMode(button.dataset.contextMode));
});

async function init() {
  document.body.classList.add('is-resume-view');
  setStatus('读取方向简历');
  const [resumes, clues, links] = await Promise.all([
    VisualizerApi.listResumes(),
    VisualizerApi.getDirectionClues(),
    VisualizerApi.listResumeJobLinks(),
  ]);
  directionClues = clues || {};
  resumeJobLinks = links.links || [];
  resumeOptions = resumes;
  if (resumeSelect) {
    resumeSelect.innerHTML = resumeOptions.map((item) => {
      return `<option value="${escapeAttr(item.file)}">${escapeHtml(item.title)}</option>`;
    }).join('');
  }
  renderResumeTitleMenu();
  await loadResume(resumes[0]?.file);
  await loadExperienceMetadata();
  await loadRecruitmentMarket();
  await syncSelectedTargetResumeState({ loadExisting: true });
  await loadApplications();
  await loadEvidenceRequests();
  await loadReplyDrafts();
  await loadResumeTemplates();
  setApplicationImportSource('email');
  document.querySelector('.toolbar-title')?.setAttribute('hidden', '');
}

function switchView(view) {
  if (view === 'reply') view = 'resume';
  currentView = view;
  const showExperience = view === 'experience';
  const showMarket = view === 'market';
  const showApplications = view === 'applications';
  const showEvidence = view === 'evidence';
  const showReply = view === 'reply';
  const showResume = !showExperience && !showMarket && !showApplications && !showEvidence && !showReply;
  document.body.classList.toggle('is-resume-view', showResume);
  document.body.classList.toggle('is-experience-view', showExperience);
  document.body.classList.toggle('is-market-view', showMarket);
  document.body.classList.toggle('is-applications-view', showApplications);
  document.body.classList.toggle('is-evidence-view', showEvidence);
  document.body.classList.toggle('is-reply-view', showReply);
  if (showMarket || showApplications || showEvidence || showReply) {
    document.querySelector('.toolbar-title')?.removeAttribute('hidden');
  } else {
    document.querySelector('.toolbar-title')?.setAttribute('hidden', '');
  }
  if (marketRailTabs) marketRailTabs.hidden = !showMarket;
  resumeView.hidden = showExperience || showMarket || showApplications || showEvidence || showReply;
  experienceView.hidden = !showExperience;
  marketView.hidden = !showMarket;
  applicationsView.hidden = !showApplications;
  replyView.hidden = !showReply;
  evidenceView.hidden = !showEvidence;
  resumeToolbarControls.hidden = showExperience || showMarket || showApplications || showEvidence || showReply;
  experienceToolbarControls.hidden = !showExperience;
  experienceViewBtn.classList.toggle('is-active', showExperience);
  resumeViewBtn.classList.toggle('is-active', showResume);
  marketViewBtn.classList.toggle('is-active', showMarket);
  applicationsViewBtn.classList.toggle('is-active', showApplications);
  replyViewBtn?.classList.toggle('is-active', showReply);
  evidenceViewBtn.classList.toggle('is-active', showEvidence);

  if (showExperience) {
    contextTitle.textContent = '经历资产';
    contextSubtitle.textContent = '文件 / 照片 / 偏好';
    titleEl.textContent = selectedExperienceFile()?.title || '经历资产';
    fileEl.textContent = selectedExperienceFile()?.path || 'mycv/project-notes';
    setStatus('经历资产');
    loadExperienceMetadata();
    return;
  }

  document.querySelector('[data-context-mode="edit"]').textContent = '简历编辑';
  document.querySelector('[data-context-mode="diagnosis"]').textContent = '简历诊断';

  if (showMarket) {
    contextTitle.textContent = '岗位列表';
    contextSubtitle.textContent = '手工导入 / 雷达搜索';
    marketRailTabs.hidden = false;
    setMarketRailMode('manual');
    titleEl.textContent = '岗位信息列表';
    fileEl.textContent = '';
    setStatus('市场扫描');
    loadRecruitmentMarket();
    return;
  }

  if (showApplications) {
    titleEl.textContent = '投递进度导入';
    fileEl.textContent = 'data/applications.md';
    setStatus('投递进度导入');
    loadApplications();
    return;
  }

  if (showReply) {
    titleEl.textContent = '面试与沟通';
    fileEl.textContent = 'data/reply-drafts.json';
    setStatus('回复助手');
    loadReplyDrafts();
    return;
  }

  if (showEvidence) {
    contextTitle.textContent = '复盘中心';
    contextSubtitle.textContent = '反馈学习';
    titleEl.textContent = '复盘中心';
    fileEl.textContent = '投递反馈与策略学习';
    setStatus('复盘中心');
    renderAiButler();
    return;
  }

  titleEl.textContent = paper.querySelector('.resume-header h1')?.textContent || '简历预览';
  fileEl.textContent = currentFile;
  setContextMode('diagnosis');
  setStatus('简历预览');
}

init();

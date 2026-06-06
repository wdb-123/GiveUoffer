async function loadResume(file) {
  if (!file) return;
  paper.dataset.resumeState = 'loaded';
  paper.dataset.paginationSignature = '';
  currentFile = file;
  setStatus('渲染预览');
  const data = await VisualizerApi.getResume(file);
  paper.innerHTML = renderMarkdown(data.markdown);
  paper.dataset.resumeSourceHtml = paper.innerHTML;
  paper.querySelectorAll('.render-editable').forEach(setupRenderedEditNode);
  paper.querySelectorAll('img').forEach((img) => {
    img.addEventListener('load', queueResumePagination, { once: true });
    if (img.complete) queueResumePagination();
  });
  currentResumePageIndex = 0;
  titleEl.textContent = paper.querySelector('.resume-header h1')?.textContent || '简历预览';
  fileEl.textContent = file;
  renderDirectionClues(file);
  if (resumeSelect) resumeSelect.value = file;
  renderResumeTitleMenu();
  applyTemplate();
  if (typeof paginateResume === 'function') paginateResume();
  renderEditMode = false;
  updateRenderedEditMode();
  await loadEditHistory(file);
  await loadResumeVersions(file);
  scheduleStableResumePagination(file);
  setResumeTargetActionsEnabled(true);
  setStatus('已更新');
}

function renderTargetResumeState(job) {
  if (!paper || !job) return;
  setResumeDeckEnabled(false);
  const label = targetJobLabel(job);
  paper.dataset.resumeState = 'missing-target';
  paper.dataset.resumeSourceHtml = '';
  paper.className = `paper template-${templateSelect.value} density-${densitySelect.value} resume-target-state-paper`;
  paper.innerHTML = `
    <section class="resume-target-state">
      <div class="resume-target-state-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5" />
          <path d="m9 15 2 2 4-5" />
        </svg>
      </div>
      <p class="eyebrow">当前岗位简历状态</p>
      <h2>还没有生成专属简历</h2>
      <p class="resume-target-state-copy">已选择：${escapeHtml(label)}。生成后系统会把这份简历和该岗位绑定，下次选择这个岗位会直接打开对应简历。</p>
      <div class="resume-target-state-actions">
        <button class="small-button primary-small-button" type="button" data-generate-target-resume="${escapeAttr(job.id)}">生成岗位简历</button>
      </div>
      <dl class="resume-target-state-meta">
        <div>
          <dt>公司</dt>
          <dd>${escapeHtml(job.company || '待确认')}</dd>
        </div>
        <div>
          <dt>岗位</dt>
          <dd>${escapeHtml(job.role || '待确认')}</dd>
        </div>
        <div>
          <dt>匹配</dt>
          <dd>${job.matchScore ? `${Number(job.matchScore).toFixed(1)} / 5` : '待评估'}</dd>
        </div>
      </dl>
    </section>
  `;
  titleEl.textContent = '未生成岗位简历';
  fileEl.textContent = label;
  directionCluesEl.innerHTML = `
    <div class="clue-title">${escapeHtml(job.direction || job.role || '目标岗位')}</div>
    ${renderClueGroup('JD 信号', job.keywords || [])}
    ${renderClueGroup('优先强化', [job.fitReason, job.evidenceGap].filter(Boolean))}
  `;
  renderEditMode = false;
  updateRenderedEditMode();
  setResumeTargetActionsEnabled(false);
  setResumeGenerationStatus('当前岗位还没有已生成的专属简历。');
  setStatus('待生成岗位简历');
  scheduleResumeToolbarSync();
}

function setResumeTargetActionsEnabled(enabled) {
  document.querySelectorAll('[data-export-format]').forEach((button) => {
    button.disabled = !enabled;
  });
  if (editPreviewBtn) editPreviewBtn.disabled = !enabled;
  if (saveResumeVersionBtn) saveResumeVersionBtn.disabled = !enabled;
}

function targetJobLabel(job = {}) {
  return `${job.company || '待确认公司'} - ${job.role || '待确认岗位'}${job.matchScore ? ` · ${Number(job.matchScore).toFixed(1)}` : ''}`;
}

function renderResumeTitleMenu() {
  if (!resumeTitleMenu) return;
  resumeTitleMenu.innerHTML = resumeOptions.map((item) => `
    <button class="resume-title-menu-item ${item.file === currentFile ? 'is-active' : ''}" type="button" data-file="${escapeAttr(item.file)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.file)}</span>
    </button>
  `).join('');
  resumeTitleMenu.querySelectorAll('.resume-title-menu-item').forEach((button) => {
    button.addEventListener('click', () => {
      closeResumeTitleMenu();
      loadResume(button.dataset.file);
    });
  });
}

function toggleResumeTitleMenu(event) {
  event.stopPropagation();
  if (currentView !== 'resume') return;
  const willOpen = resumeTitleMenu.hidden;
  resumeTitleMenu.hidden = !willOpen;
  docTitleButton.setAttribute('aria-expanded', String(willOpen));
}

function closeResumeTitleMenu() {
  resumeTitleMenu.hidden = true;
  docTitleButton.setAttribute('aria-expanded', 'false');
}

function closeResumeTitleMenuOnOutside(event) {
  if (resumeTitleMenu.hidden) return;
  if (event.target.closest('.toolbar-title')) return;
  closeResumeTitleMenu();
}

function setContextMode(mode = 'diagnosis') {
  const labels = currentView === 'experience'
    ? {
        edit: ['经历编辑', '补全字段与版本记录'],
        diagnosis: ['岗位匹配诊断', '证据、缺口与下一步'],
      }
    : {
        edit: ['简历编辑', '自动保存与修改痕迹'],
        diagnosis: ['简历诊断', '简历匹配线索'],
      };
  const active = labels[mode] ? mode : 'diagnosis';
  contextTitle.textContent = labels[active][0];
  contextSubtitle.textContent = labels[active][1];
  document.querySelectorAll('[data-context-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.contextPanel !== active;
  });
  document.querySelectorAll('.context-mode-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.contextMode === active);
  });
}

function applyTemplate() {
  paper.className = `paper template-${templateSelect.value} density-${densitySelect.value}`;
  queueResumePagination();
}

function queueResumePagination() {
  if (paper?.dataset.resumeState && paper.dataset.resumeState !== 'loaded') return;
  if (!currentFile || resumePaginationQueued) return;
  resumePaginationQueued = true;
  requestAnimationFrame(() => {
    resumePaginationQueued = false;
    paginateResume();
    updateRenderedEditMode();
  });
}

function paginateResume() {
  if (paper?.dataset.resumeState && paper.dataset.resumeState !== 'loaded') return;
  if (!paper || paper.dataset.paginating === 'true') return;
  const overflowBuffer = 4;
  const existingPages = [...paper.querySelectorAll(':scope > .resume-page')];
  const sourceTemplate = document.createElement('div');
  if (paper.dataset.resumeSourceHtml) sourceTemplate.innerHTML = paper.dataset.resumeSourceHtml;
  const sourceRoot = paper.dataset.resumeSourceHtml
    ? [...sourceTemplate.childNodes]
    : existingPages.length
      ? existingPages.flatMap((item) => [...(item.querySelector('.resume-page-content')?.childNodes || [])])
      : [...paper.childNodes];
  const sourceNodes = sourceRoot.filter((node) => {
    return node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim();
  });
  if (!sourceNodes.length) return;
  const signature = resumePaginationSignature();
  if (paper.dataset.paginationSignature === signature && existingPages.length) {
    updateResumeDeck();
    return;
  }

  paper.dataset.paginating = 'true';
  paper.textContent = '';
  let page = createResumePage();
  let content = page.querySelector('.resume-page-content');
  paper.append(page);

  const startNewPage = () => {
    page = createResumePage();
    content = page.querySelector('.resume-page-content');
    paper.append(page);
  };
  const overflows = () => content.scrollHeight > content.clientHeight + overflowBuffer;
  const createSectionShell = (section) => {
    const shell = document.createElement('section');
    shell.className = section.className;
    return shell;
  };
  const createListShell = (list) => {
    const shell = document.createElement('ul');
    shell.className = list.className;
    return shell;
  };
  const appendWithoutOverflow = (parent, child) => {
    parent.append(child);
    if (!overflows()) return true;
    parent.removeChild(child);
    return false;
  };

  const splitList = (list, section) => {
    let activeSection = section;
    let activeList = createListShell(list);
    activeSection.append(activeList);
    for (const item of [...list.children]) {
      if (appendWithoutOverflow(activeList, item)) continue;
      if (!activeList.children.length) {
        activeList.append(item);
        continue;
      }
      startNewPage();
      activeSection = createSectionShell(section);
      content.append(activeSection);
      activeList = createListShell(list);
      activeSection.append(activeList);
      activeList.append(item);
    }
  };

  const splitSection = (section) => {
    let activeSection = createSectionShell(section);
    content.append(activeSection);
    for (const child of [...section.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        activeSection.append(child);
        continue;
      }
      if (child.tagName === 'UL') {
        splitList(child, activeSection);
        continue;
      }
      if (appendWithoutOverflow(activeSection, child)) continue;
      if (!activeSection.childElementCount) {
        activeSection.append(child);
        continue;
      }
      startNewPage();
      activeSection = createSectionShell(section);
      content.append(activeSection);
      activeSection.append(child);
    }
  };

  for (const node of sourceNodes) {
    if (node.classList?.contains('resume-section')) {
      content.append(node);
      if (!overflows()) continue;
      content.removeChild(node);
      if (content.childNodes.length) {
        startNewPage();
        content.append(node);
        if (!overflows()) continue;
        content.removeChild(node);
      }
      splitSection(node);
      continue;
    }
    content.append(node);
    if (!overflows()) continue;
    content.removeChild(node);
    if (content.childNodes.length) startNewPage();
    content.append(node);
  }

  rebalanceResumePages(overflowBuffer);
  removeBlankResumePages();

  paper.querySelectorAll('.resume-page').forEach((item, index) => {
    item.dataset.page = String(index + 1);
  });
  paper.dataset.paginationSignature = signature;
  paper.dataset.paginating = 'false';
  updateResumeDeck();
}

function resumePaginationSignature() {
  const rect = paper.getBoundingClientRect();
  return [
    currentFile,
    paper.dataset.resumeSourceHtml?.length || 0,
    templateSelect?.value || '',
    densitySelect?.value || '',
    Math.round(rect.width),
    getComputedStyle(paper).zoom || '',
  ].join(':');
}

function rebalanceResumePages(overflowBuffer = 12) {
  const pageOverflows = (page) => {
    const content = page.querySelector('.resume-page-content');
    return content && content.scrollHeight > content.clientHeight + 1;
  };
  const ensureNextPage = (page) => {
    let next = page.nextElementSibling;
    if (!next?.classList?.contains('resume-page')) {
      next = createResumePage();
      paper.insertBefore(next, page.nextSibling);
    }
    return next;
  };

  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const page = [...paper.querySelectorAll(':scope > .resume-page')].find(pageOverflows);
    if (!page) break;
    const content = page.querySelector('.resume-page-content');
    const movable = [...content.children].at(-1);
    if (!movable || content.children.length <= 1) break;
    const nextContent = ensureNextPage(page).querySelector('.resume-page-content');
    nextContent.insertBefore(movable, nextContent.firstChild);
  }

  paper.querySelectorAll(':scope > .resume-page').forEach((page) => {
    const content = page.querySelector('.resume-page-content');
    if (content && !content.children.length) page.remove();
  });
}

function removeBlankResumePages() {
  const pages = [...paper.querySelectorAll(':scope > .resume-page')];
  if (pages.length <= 1) return;
  pages.forEach((page) => {
    const content = page.querySelector('.resume-page-content');
    const hasMeaningfulContent = content && (
      content.textContent.trim() ||
      content.querySelector('img, svg, canvas, table, .resume-avatar')
    );
    if (!hasMeaningfulContent) page.remove();
  });
  if (!paper.querySelector(':scope > .resume-page')) {
    const fallback = createResumePage();
    paper.append(fallback);
  }
}

function scheduleStableResumePagination(file) {
  const run = () => {
    if (file !== currentFile || currentView !== 'resume') return;
    if (paper?.dataset.resumeState && paper.dataset.resumeState !== 'loaded') return;
    paginateResume();
    updateRenderedEditMode();
  };
  if (document.fonts?.ready) {
    document.fonts.ready.then(run).catch(() => {});
  }
  [80, 320, 900].forEach((delay) => setTimeout(run, delay));
}

function createResumePage() {
  const page = document.createElement('section');
  page.className = 'resume-page';
  const content = document.createElement('div');
  content.className = 'resume-page-content';
  page.append(content);
  return page;
}

function setResumeDeckEnabled(enabled) {
  document.body.classList.toggle('has-resume-deck', Boolean(enabled));
  if (!enabled) {
    paper?.classList.remove('is-deck');
    document.querySelector('.resume-deck-controls')?.remove();
  }
}

function ensureResumeDeckControls() {
  if (!resumeView) return null;
  let controls = resumeView.querySelector('.resume-deck-controls');
  if (controls) return controls;
  controls = document.createElement('div');
  controls.className = 'resume-deck-controls';
  controls.innerHTML = `
    <button class="resume-deck-button" type="button" data-resume-page-prev aria-label="上一页">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 6 9 12l6 6" />
      </svg>
    </button>
    <span class="resume-deck-count" aria-live="polite"></span>
    <button class="resume-deck-button" type="button" data-resume-page-next aria-label="下一页">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  `;
  controls.querySelectorAll('[data-resume-page-prev]').forEach((item) => {
    item.addEventListener('click', () => showResumePage(currentResumePageIndex - 1));
  });
  controls.querySelectorAll('[data-resume-page-next]').forEach((item) => {
    item.addEventListener('click', () => showResumePage(currentResumePageIndex + 1));
  });
  resumeView.append(controls);
  return controls;
}

function updateResumeDeck() {
  if (!paper || paper.dataset.resumeState !== 'loaded') {
    setResumeDeckEnabled(false);
    return;
  }
  const pages = [...paper.querySelectorAll(':scope > .resume-page')];
  if (!pages.length) {
    setResumeDeckEnabled(false);
    return;
  }
  currentResumePageIndex = wrapResumePageIndex(currentResumePageIndex, pages.length);
  paper.classList.add('is-deck');
  setResumeDeckEnabled(true);
  const controls = ensureResumeDeckControls();
  if (controls) {
    controls.hidden = pages.length <= 1;
    controls.querySelector('.resume-deck-count').textContent = `${currentResumePageIndex + 1} / ${pages.length}`;
    controls.querySelectorAll('[data-resume-page-prev], [data-resume-page-next]').forEach((item) => {
      item.disabled = pages.length <= 1;
    });
  }
  pages.forEach((page, index) => {
    const offset = circularDeckOffset(index, currentResumePageIndex, pages.length);
    page.dataset.deckOffset = String(offset);
    page.classList.toggle('is-active-page', offset === 0);
    page.classList.toggle('is-prev-page', false);
    page.classList.toggle('is-next-page', offset === 1);
    page.classList.toggle('is-far-prev-page', false);
    page.classList.toggle('is-far-next-page', offset === 2);
    page.classList.toggle('is-hidden-page', offset > 2);
    page.tabIndex = offset <= 2 ? 0 : -1;
    page.setAttribute('role', offset === 0 ? 'document' : 'button');
    page.setAttribute('aria-label', offset === 0
      ? `当前第 ${index + 1} 页`
      : `跳转到第 ${index + 1} 页`);
    page.setAttribute('aria-hidden', String(offset !== 0));
  });
  scheduleResumeToolbarSync();
}

function showResumePage(index) {
  const pages = [...paper.querySelectorAll(':scope > .resume-page')];
  if (!pages.length) return;
  const next = wrapResumePageIndex(index, pages.length);
  if (next === currentResumePageIndex) return;
  currentResumePageIndex = next;
  updateResumeDeck();
}

function wrapResumePageIndex(index, total) {
  if (!total) return 0;
  const value = Number(index) || 0;
  return ((value % total) + total) % total;
}

function circularDeckOffset(index, currentIndex, total) {
  if (total <= 1) return 0;
  return ((index - currentIndex) % total + total) % total;
}

function handleResumeDeckKeydown(event) {
  if (currentView !== 'resume' || paper?.dataset.resumeState !== 'loaded') return;
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showResumePage(currentResumePageIndex - 1);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    showResumePage(currentResumePageIndex + 1);
  }
}

let resumeDeckPointerStart = null;
let resumeDeckPointerDragging = false;

function handleResumeDeckPointerDown(event) {
  if (currentView !== 'resume' || paper?.dataset.resumeState !== 'loaded') return;
  if (event.target.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return;
  const page = event.target.closest?.('.resume-page');
  resumeDeckPointerStart = {
    x: event.clientX,
    y: event.clientY,
    pageIndex: page ? [...paper.querySelectorAll(':scope > .resume-page')].indexOf(page) : -1,
  };
  resumeDeckPointerDragging = false;
  paper.style.setProperty('--deck-drag-x', '0px');
  paper.style.setProperty('--deck-drag-rotate', '0deg');
  paper.setPointerCapture?.(event.pointerId);
}

function handleResumeDeckPointerMove(event) {
  if (!resumeDeckPointerStart || currentView !== 'resume' || paper?.dataset.resumeState !== 'loaded') return;
  const dx = event.clientX - resumeDeckPointerStart.x;
  const dy = event.clientY - resumeDeckPointerStart.y;
  if (!resumeDeckPointerDragging && Math.abs(dx) < 8) return;
  if (Math.abs(dx) < Math.abs(dy) * 0.9) return;
  resumeDeckPointerDragging = true;
  const clamped = Math.max(-140, Math.min(140, dx));
  paper.classList.add('is-dragging-page');
  paper.style.setProperty('--deck-drag-x', `${clamped}px`);
  paper.style.setProperty('--deck-drag-rotate', `${(clamped / 36).toFixed(2)}deg`);
}

function handleResumeDeckPointerUp(event) {
  if (!resumeDeckPointerStart) return;
  const dx = event.clientX - resumeDeckPointerStart.x;
  const dy = event.clientY - resumeDeckPointerStart.y;
  const targetPageIndex = resumeDeckPointerStart.pageIndex;
  resumeDeckPointerStart = null;
  paper.classList.remove('is-dragging-page');
  paper.style.setProperty('--deck-drag-x', '0px');
  paper.style.setProperty('--deck-drag-rotate', '0deg');
  if (!resumeDeckPointerDragging && targetPageIndex >= 0 && targetPageIndex !== currentResumePageIndex) {
    showResumePage(targetPageIndex);
    return;
  }
  if (!resumeDeckPointerDragging && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
    const activePage = paper.querySelector('.resume-page.is-active-page');
    const rect = activePage?.getBoundingClientRect();
    if (rect && event.clientX > rect.right - 76) {
      showResumePage(currentResumePageIndex + 1);
      return;
    }
    if (rect && event.clientX < rect.left + 76) {
      showResumePage(currentResumePageIndex - 1);
      return;
    }
  }
  resumeDeckPointerDragging = false;
  if (Math.abs(dx) < 76 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
  showResumePage(currentResumePageIndex + (dx < 0 ? 1 : -1));
}

function handleResumeDeckPointerCancel() {
  resumeDeckPointerStart = null;
  resumeDeckPointerDragging = false;
  paper?.classList.remove('is-dragging-page');
  paper?.style.setProperty('--deck-drag-x', '0px');
  paper?.style.setProperty('--deck-drag-rotate', '0deg');
}

function syncResumeToolbarToPaper() {
  if (!resumeToolbarControls || currentView !== 'resume') {
    resumeToolbarControls?.style.removeProperty('--resume-toolbar-aligned-left');
    resumeToolbarControls?.style.removeProperty('--resume-toolbar-aligned-width');
    return;
  }
  const target = paper;
  const actions = document.querySelector('.toolbar-actions');
  if (!target || !actions) return;
  const targetRect = target.getBoundingClientRect();
  const actionsRect = actions.getBoundingClientRect();
  syncContextRailToPaper(targetRect);
  const left = targetRect.left - actionsRect.left;
  const width = Math.max(280, targetRect.width);
  resumeToolbarControls.style.setProperty('--resume-toolbar-aligned-left', `${left.toFixed(2)}px`);
  resumeToolbarControls.style.setProperty('--resume-toolbar-aligned-width', `${width.toFixed(2)}px`);
  const controlsRect = resumeToolbarControls.getBoundingClientRect();
  const leftDelta = controlsRect.left - targetRect.left;
  const rightDelta = controlsRect.right - targetRect.right;
  if (Math.abs(leftDelta) > 0.5 || Math.abs(rightDelta) > 0.5) {
    const correctedLeft = left - leftDelta;
    const correctedWidth = Math.max(280, width + leftDelta - rightDelta);
    resumeToolbarControls.style.setProperty('--resume-toolbar-aligned-left', `${correctedLeft.toFixed(2)}px`);
    resumeToolbarControls.style.setProperty('--resume-toolbar-aligned-width', `${correctedWidth.toFixed(2)}px`);
  }
}

function scheduleResumeToolbarSync() {
  requestAnimationFrame(() => {
    syncResumeToolbarToPaper();
    requestAnimationFrame(syncResumeToolbarToPaper);
  });
  setTimeout(syncResumeToolbarToPaper, 100);
  setTimeout(syncResumeToolbarToPaper, 340);
  setTimeout(syncResumeToolbarToPaper, 720);
}

function syncContextRailToPaper(targetRect = null) {
  const rail = document.querySelector('.context-rail');
  if (!rail || currentView !== 'resume') {
    rail?.style.removeProperty('--resume-context-rail-top');
    return;
  }
  const target = targetRect ? null : paper;
  const rect = targetRect || target?.getBoundingClientRect();
  if (!rect) return;
  rail.style.setProperty('--resume-context-rail-top', `${Math.max(0, rect.top).toFixed(2)}px`);
}

async function loadResumeTemplates() {
  const data = await VisualizerApi.listResumeTemplates();
  renderResumeTemplates(data.templates || []);
}

function renderResumeTemplates(templates) {
  resumeTemplateList.innerHTML = templates.length
    ? templates.map((item) => `
      <div class="resume-template-item">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.kind.toUpperCase())} · ${escapeHtml(item.path)}</span>
      </div>
    `).join('')
    : '<div class="empty-state">还没有导入模板。</div>';
}

async function importResumeTemplate() {
  const files = [...(resumeTemplateImportInput.files || [])];
  if (!files.length) return;
  resumeTemplateStatus.textContent = '导入简历模板...';
  for (const file of files) {
    const contentBase64 = await fileToBase64(file);
    const result = await VisualizerApi.importResumeTemplate({ name: file.name, contentBase64 });
    renderResumeTemplates(result.templates || []);
    resumeTemplateStatus.textContent = `已导入 ${result.path}`;
  }
  resumeTemplateImportInput.value = '';
}

function renderDirectionClues(file) {
  const clues = directionClues[file];
  if (!clues) {
    const job = targetJobForResume(file);
    if (!job) {
      directionCluesEl.innerHTML = '<p class="clue-empty">选择目标岗位后显示。</p>';
      strategyCluesEl.textContent = '选择方向后显示。';
      return;
    }
    renderTargetJobDiagnosis(job);
    return;
  }

  directionCluesEl.innerHTML = `
    <div class="clue-title">${escapeHtml(clues.direction)}</div>
    ${renderClueGroup('JD 信号', clues.jdSignals)}
    ${renderClueTags(clues.keywords)}
    ${renderClueGroup('优先强化', clues.strengthen)}
    ${renderClueGroup('不要乱写', clues.avoid)}
  `;
}

function targetJobForResume(file = currentFile) {
  const directJobId = resumeTargetJobSelect?.value || currentResumeTargetJobId || '';
  const directJob = directJobId
    ? (currentMarketData.jobs || []).find((item) => item.id === directJobId)
    : null;
  if (directJob) return directJob;
  const link = (resumeJobLinks || []).find((item) => item.file === file);
  if (!link?.jobId) return null;
  return (currentMarketData.jobs || []).find((item) => item.id === link.jobId) || {
    id: link.jobId,
    company: link.company,
    role: link.role,
    direction: link.role,
    matchScore: '',
    keywords: [],
    fitReason: '',
    evidenceGap: '',
  };
}

function renderTargetJobDiagnosis(job = {}) {
  const direction = job.direction || job.role || '目标岗位';
  const salaryText = job.salary
    ? (typeof displaySalary === 'function' ? displaySalary(job.salary) : String(job.salary))
    : '';
  const jdSignals = uniqueDiagnosisItems([
    ...(job.keywords || []),
    job.role,
    job.company,
  ]).slice(0, 8);
  const strengthen = uniqueDiagnosisItems([
    job.fitReason,
    job.evidenceGap,
    salaryText ? `薪资/职级信号：${salaryText}` : '',
  ]).slice(0, 4);
  strategyCluesEl.textContent = [
    job.company && job.role ? `围绕 ${job.company}「${job.role}」做定制表达。` : '',
    job.fitReason || '',
    job.evidenceGap ? `优先补强：${job.evidenceGap}` : '',
  ].filter(Boolean).join(' ') || '这份简历会根据当前目标岗位生成投递策略。';
  directionCluesEl.innerHTML = `
    <div class="clue-title">${escapeHtml(direction)}</div>
    ${renderClueGroup('JD 信号', jdSignals)}
    ${renderClueGroup('优先强化', strengthen)}
    ${renderClueTags((job.keywords || []).slice(0, 10))}
  `;
}

function uniqueDiagnosisItems(items = []) {
  const seen = new Set();
  return items
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function renderClueGroup(title, items = []) {
  if (!items.length) return '';
  return `
    <div class="clue-group">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
  `;
}

function renderClueTags(items = []) {
  if (!items.length) return '';
  return `<div class="clue-tags">${items.slice(0, 10).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

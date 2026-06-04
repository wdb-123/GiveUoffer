async function loadResume(file) {
  if (!file) return;
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
  titleEl.textContent = paper.querySelector('.resume-header h1')?.textContent || '简历预览';
  fileEl.textContent = file;
  renderDirectionClues(file);
  resumeSelect.value = file;
  renderResumeTitleMenu();
  applyTemplate();
  if (typeof paginateResume === 'function') paginateResume();
  renderEditMode = false;
  updateRenderedEditMode();
  await loadEditHistory(file);
  await loadResumeVersions(file);
  scheduleStableResumePagination(file);
  setStatus('已更新');
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
  if (!currentFile || resumePaginationQueued) return;
  resumePaginationQueued = true;
  requestAnimationFrame(() => {
    resumePaginationQueued = false;
    paginateResume();
    updateRenderedEditMode();
  });
}

function paginateResume() {
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

  paper.querySelectorAll('.resume-page').forEach((item, index) => {
    item.dataset.page = String(index + 1);
  });
  paper.dataset.paginating = 'false';
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

function scheduleStableResumePagination(file) {
  const run = () => {
    if (file !== currentFile || currentView !== 'resume') return;
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
    directionCluesEl.innerHTML = '<p class="clue-empty">这份简历还没有结构化方向线索。</p>';
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

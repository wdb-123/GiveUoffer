function toggleRenderedEditMode() {
  renderEditMode = !renderEditMode;
  updateRenderedEditMode();
  setStatus(renderEditMode ? '渲染态编辑中' : '简历预览');
}

function enableRenderedInlineEditing(event) {
  if (currentView !== 'resume') return;
  renderEditMode = true;
  updateRenderedEditMode();
  const target = event.target.closest?.('.render-editable');
  if (target) {
    target.focus();
    placeCaretAtEnd(target);
  }
  setStatus('双击编辑已开启，修改会自动保存');
}

function updateRenderedEditMode() {
  paper.classList.toggle('is-editing', renderEditMode);
  if (editPreviewBtn) editPreviewBtn.textContent = renderEditMode ? '退出编辑' : '编辑预览';
  if (savePreviewBtn) savePreviewBtn.disabled = !renderEditMode || !paper.querySelector('.render-editable.is-modified');
  paper.querySelectorAll('.render-editable').forEach((node) => {
    node.contentEditable = renderEditMode ? 'true' : 'false';
    if (!node.dataset.renderBefore) node.dataset.renderBefore = normalizeRenderedText(node);
  });
}

function setupRenderedEditNode(node) {
  node.addEventListener('focus', () => {
    if (!node.dataset.renderBefore || !node.classList.contains('is-modified')) {
      node.dataset.renderBefore = normalizeRenderedText(node);
    }
  });
  node.addEventListener('input', () => {
    const modified = normalizeRenderedText(node) !== (node.dataset.renderBefore || '');
    node.classList.toggle('is-modified', modified);
    if (savePreviewBtn) savePreviewBtn.disabled = !renderEditMode || !paper.querySelector('.render-editable.is-modified');
    if (modified) scheduleRenderedAutosave(node, currentFile);
  });
  node.addEventListener('blur', () => saveRenderedNode(node, currentFile));
}

function scheduleRenderedAutosave(node, file) {
  const key = `${file}:${node.dataset.lineIndex}`;
  clearTimeout(renderedAutosaveTimers.get(key));
  renderedAutosaveTimers.set(key, setTimeout(() => {
    renderedAutosaveTimers.delete(key);
    saveRenderedNode(node, file);
  }, 900));
}

async function saveRenderedNode(node, file) {
  if (!renderEditMode || file !== currentFile || !node?.isConnected) return;
  const renderAfter = normalizeRenderedText(node);
  const renderBefore = node.dataset.renderBefore || '';
  if (renderAfter === renderBefore || node.dataset.saving === 'true') return;

  node.dataset.saving = 'true';
  node.classList.add('is-saving');
  setStatus('自动保存修改');
  try {
    const result = await VisualizerApi.saveResumeLineEdit({
      file,
      changes: [{
        lineIndex: Number(node.dataset.lineIndex),
        renderBefore,
        renderAfter,
        after: markdownLineFromNode(node),
      }],
    });

    if (result.saved) {
      node.dataset.renderBefore = renderAfter;
      node.classList.remove('is-modified');
      node.classList.add('is-saved');
      await loadEditHistory(file);
      setStatus('已自动保存痕迹');
      setTimeout(() => node.classList.remove('is-saved'), 1200);
    } else {
      setStatus('没有新的修改');
    }
  } catch (err) {
    node.classList.add('is-modified');
    setStatus('自动保存失败');
  } finally {
    node.dataset.saving = 'false';
    node.classList.remove('is-saving');
  }
}

function placeCaretAtEnd(node) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function saveRenderedEdits() {
  const modified = [...paper.querySelectorAll('.render-editable.is-modified')];
  if (!modified.length) return;
  if (savePreviewBtn) savePreviewBtn.disabled = true;
  setStatus('保存渲染修改');
  const changes = modified.map((node) => {
    return {
      lineIndex: Number(node.dataset.lineIndex),
      renderBefore: node.dataset.renderBefore || '',
      renderAfter: normalizeRenderedText(node),
      after: markdownLineFromNode(node),
    };
  });

  try {
    const result = await VisualizerApi.saveResumeLineEdit({ file: currentFile, changes });
    renderEditMode = false;
    await loadResume(currentFile);
    await loadEditHistory(currentFile);
    setStatus(`已保存 ${result.saved || 0} 处`);
  } catch (err) {
    setStatus('保存失败');
    if (savePreviewBtn) savePreviewBtn.disabled = false;
  }
}

function markdownLineFromNode(node) {
  const text = normalizeRenderedText(node);
  const prefix = node.dataset.mdPrefix || '';
  if (prefix === 'plain') return text;
  return `${prefix}${text}`;
}

function normalizeRenderedText(node) {
  return node.textContent.replace(/\s+/g, ' ').trim();
}

async function loadEditHistory(file) {
  const data = await VisualizerApi.getResumeEdits(file);
  const edits = data.edits || [];
  editHistoryEl.innerHTML = edits.length
    ? edits.slice(0, 8).map(renderEditHistoryItem).join('')
    : '<p class="clue-empty">还没有渲染态修改记录。</p>';
}

function renderEditHistoryItem(item) {
  const time = item.changedAt ? new Date(item.changedAt).toLocaleString('zh-CN', { hour12: false }) : '';
  return `
    <article class="edit-history-item">
      <div><strong>第 ${Number(item.lineIndex || 0) + 1} 行</strong><span>${escapeHtml(time)}</span></div>
      <p><del>${escapeHtml(item.renderBefore || item.before || '')}</del></p>
      <p><ins>${escapeHtml(item.renderAfter || item.after || '')}</ins></p>
    </article>
  `;
}

async function loadResumeVersions(file) {
  if (!resumeVersionSelect) return;
  try {
    const data = await VisualizerApi.getResumeVersions(file);
    currentResumeVersions = data.versions || [];
    renderResumeVersionOptions();
  } catch (err) {
    currentResumeVersions = [];
    renderResumeVersionOptions('版本记录读取失败。');
  }
}

function renderResumeVersionOptions(statusText = '') {
  if (!resumeVersionSelect) return;
  const options = currentResumeVersions.map((item) => {
    const time = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
    const source = item.source === 'restore' ? '恢复点' : '手动版本';
    const label = [time, source, item.note || item.title || item.id].filter(Boolean).join(' · ');
    return `<option value="${escapeAttr(item.id)}">${escapeHtml(label)}</option>`;
  }).join('');
  resumeVersionSelect.innerHTML = `<option value="">选择历史版本</option>${options}`;
  if (restoreResumeVersionBtn) restoreResumeVersionBtn.disabled = true;
  if (resumeVersionStatus) {
    resumeVersionStatus.textContent = statusText || (currentResumeVersions.length
      ? `已有 ${currentResumeVersions.length} 个版本，可选择后切换。`
      : '保存当前简历快照后，可回到之前版本。');
  }
}

async function saveResumeVersion() {
  if (!currentFile || !saveResumeVersionBtn) return;
  saveResumeVersionBtn.disabled = true;
  setStatus('保存简历版本');
  if (resumeVersionStatus) resumeVersionStatus.textContent = '正在保存当前版本...';
  try {
    await flushRenderedResumeEdits();
    const note = titleEl.textContent ? `${titleEl.textContent} 快照` : '手动保存版本';
    const data = await VisualizerApi.createResumeVersion({ file: currentFile, note });
    currentResumeVersions = data.versions || [];
    renderResumeVersionOptions('已保存成版本。');
    setStatus('版本已保存');
  } catch (err) {
    if (resumeVersionStatus) resumeVersionStatus.textContent = '版本保存失败，请稍后重试。';
    setStatus('版本保存失败');
  } finally {
    saveResumeVersionBtn.disabled = false;
  }
}

async function exportResume(format) {
  if (!currentFile || !format) return;
  setStatus(`导出 ${format.toUpperCase()}`);
  try {
    await flushRenderedResumeEdits();
    if (exportMenu) exportMenu.open = false;
    const link = document.createElement('a');
    link.href = `/api/resume-export?file=${encodeURIComponent(currentFile)}&format=${encodeURIComponent(format)}`;
    link.download = '';
    document.body.append(link);
    link.click();
    link.remove();
    setStatus(`已开始导出 ${format.toUpperCase()}`);
  } catch (err) {
    setStatus('导出失败');
  }
}

async function autoGenerateResume() {
  if (!autoGenerateResumeBtn) return;
  autoGenerateResumeBtn.disabled = true;
  setStatus('自动生成简历');
  try {
    await flushRenderedResumeEdits();
    const result = await VisualizerApi.autoGenerateResume({ baseFile: currentFile });
    resumeOptions = await VisualizerApi.listResumes();
    resumeSelect.innerHTML = resumeOptions.map((item) => {
      return `<option value="${escapeAttr(item.file)}">${escapeHtml(item.title)}</option>`;
    }).join('');
    renderResumeTitleMenu();
    await loadResume(result.file);
    setStatus('已生成简历');
  } catch (err) {
    setStatus(`生成失败：${err.message || err}`);
  } finally {
    autoGenerateResumeBtn.disabled = false;
  }
}

async function restoreResumeVersion() {
  const id = resumeVersionSelect?.value;
  if (!currentFile || !id || !restoreResumeVersionBtn) return;
  restoreResumeVersionBtn.disabled = true;
  setStatus('切换简历版本');
  if (resumeVersionStatus) resumeVersionStatus.textContent = '正在切换到选中版本...';
  try {
    await flushRenderedResumeEdits();
    const data = await VisualizerApi.restoreResumeVersion({ file: currentFile, id });
    currentResumeVersions = data.versions || [];
    await loadResume(currentFile);
    renderResumeVersionOptions('已切换到选中版本，并自动生成恢复点。');
    setStatus('已切换版本');
  } catch (err) {
    if (resumeVersionStatus) resumeVersionStatus.textContent = '版本切换失败，请确认版本仍存在。';
    setStatus('版本切换失败');
    restoreResumeVersionBtn.disabled = false;
  }
}

async function flushRenderedResumeEdits() {
  const modified = [...paper.querySelectorAll('.render-editable.is-modified')];
  if (!modified.length) return;
  for (const [key, timer] of renderedAutosaveTimers.entries()) {
    if (key.startsWith(`${currentFile}:`)) {
      clearTimeout(timer);
      renderedAutosaveTimers.delete(key);
    }
  }
  await Promise.all(modified.map((node) => saveRenderedNode(node, currentFile)));
}


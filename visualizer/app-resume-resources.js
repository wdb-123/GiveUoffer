async function openResource(path) {
  if (!path) return;
  currentResourcePath = '';
  resourceEditor.hidden = false;
  resourceTitle.textContent = path;
  resourceList.innerHTML = '';
  resourceText.value = '';
  resourcePreview.innerHTML = '';
  resourceBody.hidden = true;
  resourceSaveBtn.disabled = true;
  resourceStatus.textContent = '读取本地资源...';
  setStatus('读取资源');

  try {
    const data = await VisualizerApi.getWorkspaceResource(path);
    renderResource(data);
    setStatus('资源已打开');
  } catch (err) {
    resourceStatus.textContent = `打开失败：${err.message || err}`;
    setStatus('资源失败');
  }
}

function renderResource(data) {
  resourceTitle.textContent = data.path || '本地资源';
  if (data.type === 'directory') {
    currentResourcePath = '';
    resourceBody.hidden = true;
    resourceSaveBtn.disabled = true;
    resourceList.innerHTML = data.entries?.length
      ? data.entries.map((entry) => `
          <button class="resource-item" type="button" data-path="${escapeAttr(entry.path)}">
            <span>${entry.type === 'directory' ? '目录' : '文件'}</span>
            <strong>${escapeHtml(entry.name)}</strong>
            <code>${escapeHtml(entry.path)}</code>
          </button>
        `).join('')
      : '<div class="empty-state">这个目录当前没有可显示文件。</div>';
    resourceList.querySelectorAll('.resource-item').forEach((button) => {
      button.addEventListener('click', () => openResource(button.dataset.path));
    });
    resourceStatus.textContent = `已打开 ${data.entries?.length || 0} 个资源。`;
    return;
  }

  currentResourcePath = data.path;
  resourceList.innerHTML = '';
  resourceBody.hidden = false;
  resourceText.value = data.content || '';
  resourceText.readOnly = !data.editable;
  resourceSaveBtn.disabled = !data.editable;
  renderResourcePreview(data.path, data.content || '');
  resourceStatus.textContent = data.editable
    ? '可编辑。修改后点击“保存并刷新”。'
    : '这个文件类型只支持预览，不在网页里直接编辑。';
}

function renderResourcePreview(path, content) {
  if (/\.json$/i.test(path)) {
    try {
      resourcePreview.innerHTML = `<pre>${escapeHtml(JSON.stringify(JSON.parse(content), null, 2))}</pre>`;
    } catch {
      resourcePreview.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
    }
    return;
  }
  if (/\.md$/i.test(path)) {
    resourcePreview.innerHTML = renderMiniMarkdown(content);
    return;
  }
  resourcePreview.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
}

async function saveResource() {
  if (!currentResourcePath) return;
  resourceSaveBtn.disabled = true;
  resourceStatus.textContent = '保存中...';
  try {
    const result = await VisualizerApi.saveWorkspaceResource({ path: currentResourcePath, content: resourceText.value });
    resourceStatus.textContent = `已保存 ${result.path}`;
    await refreshAfterResourceSave(result.path);
    setStatus('资源已保存');
  } catch (err) {
    resourceStatus.textContent = `保存失败：${err.message || err}`;
    setStatus('保存失败');
  } finally {
    resourceSaveBtn.disabled = false;
  }
}

async function refreshAfterResourceSave(path) {
  if (path === `resumes/${currentFile}`) await loadResume(currentFile);
  if (path === 'resumes/direction-clues.json') {
    directionClues = await VisualizerApi.getDirectionClues();
    renderDirectionClues(currentFile);
  }
  if (path.includes('recruitment-market')) await loadRecruitmentMarket();
  if (path.includes('evidence-requests')) await loadEvidenceRequests();
  if (path.includes('applications')) await loadApplications();
}

function closeResourceEditor() {
  resourceEditor.hidden = true;
}


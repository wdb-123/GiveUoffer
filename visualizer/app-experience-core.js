async function loadExperienceMetadata() {
  if (currentView === 'experience') setStatus('读取经历文件');
  const data = await VisualizerApi.getExperienceFiles();
  currentExperienceFiles = data.files || [];
  currentHeadshots = data.photos || [];
  currentIntentions = data.intentions || [];
  const currentPathExists = [...currentExperienceFiles, ...currentHeadshots, ...currentIntentions].some((item) => item.path === currentExperiencePath);
  if (!currentExperiencePath || !currentPathExists) {
    currentExperiencePath = currentExperienceFiles.find((item) => item.path.includes('ethercat-drop-op'))?.path
      || currentExperienceFiles[0]?.path
      || currentHeadshots[0]?.path
      || currentIntentions[0]?.path
      || '';
  }
  if (!currentExperienceFiles.some((item) => item.path === currentExperiencePath) && currentHeadshots.some((item) => item.path === currentExperiencePath)) {
    currentExperienceAssetType = 'photo';
  } else if (!currentExperienceFiles.some((item) => item.path === currentExperiencePath) && currentIntentions.some((item) => item.path === currentExperiencePath)) {
    currentExperienceAssetType = 'intention';
  }
  renderExperienceMetadata();
  if (currentView === 'experience') setStatus('已更新');
}

function renderExperienceMetadata() {
  renderExperienceFiles();
  const selected = selectedExperience();
  renderExperienceForm(selected);
  renderExperienceDiagnosis(selected);
  renderExperienceVersions(currentExperienceData?.versions || []);
}

function renderExperienceFiles() {
  const selected = currentExperienceAssetType === 'photo'
    ? selectedHeadshot()
    : currentExperienceAssetType === 'intention'
      ? selectedIntention()
      : selectedExperienceFile();
  if (experienceFileCount) experienceFileCount.textContent = `${currentExperienceFiles.length} 个`;
  if (headshotCount) headshotCount.textContent = `${currentHeadshots.length} 个`;
  if (intentionCount) intentionCount.textContent = `${currentIntentions.length} 个`;
  experienceFileList.innerHTML = currentExperienceFiles.length
    ? currentExperienceFiles.map(renderExperienceFileItem).join('')
    : '<div class="empty-state">还没有项目经历文件。</div>';
  experienceFileList.querySelectorAll('.experience-file-item').forEach((button) => {
    button.addEventListener('click', () => {
      currentExperiencePath = button.dataset.path;
      currentExperienceAssetType = 'file';
      experienceGeneratedOutput.hidden = true;
      renderExperienceMetadata();
    });
  });
  headshotList.innerHTML = currentHeadshots.length
    ? currentHeadshots.map(renderHeadshotItem).join('')
    : '<div class="empty-state">还没有职业照。</div>';
  headshotList.querySelectorAll('.experience-file-item').forEach((button) => {
    button.addEventListener('click', () => {
      currentExperiencePath = button.dataset.path;
      currentExperienceAssetType = 'photo';
      experienceGeneratedOutput.hidden = true;
      renderExperienceMetadata();
    });
  });
  if (intentionList) {
    intentionList.innerHTML = currentIntentions.length
      ? currentIntentions.map(renderIntentionItem).join('')
      : '<div class="empty-state">还没有职业意向偏好。</div>';
    intentionList.querySelectorAll('.experience-file-item').forEach((button) => {
      button.addEventListener('click', () => {
        currentExperiencePath = button.dataset.path;
        currentExperienceAssetType = 'intention';
        experienceGeneratedOutput.hidden = true;
        renderExperienceMetadata();
      });
    });
  }
  if (currentExperienceAssetType === 'photo') renderHeadshotPreview(selected);
  else if (currentExperienceAssetType === 'intention') renderIntentionPreview(selected);
  else renderExperienceFilePreview(selected);
}

function renderExperienceFileItem(item) {
  return `
    <button class="experience-file-item ${item.path === currentExperiencePath ? 'is-active' : ''}" type="button" data-path="${escapeAttr(item.path)}">
      <span class="experience-file-kind">${escapeHtml(item.kind.toUpperCase())}</span>
      <strong>${escapeHtml(item.title || item.name)}</strong>
      <span class="experience-file-name">${escapeHtml(item.name)}</span>
    </button>
  `;
}

function renderHeadshotItem(item) {
  return `
    <button class="experience-file-item ${item.path === currentExperiencePath ? 'is-active' : ''}" type="button" data-path="${escapeAttr(item.path)}">
      <span class="experience-file-kind">${escapeHtml(item.kind.toUpperCase())}</span>
      <strong>${escapeHtml(item.title || item.name)}</strong>
      <span class="experience-file-name">${escapeHtml(item.name)}</span>
    </button>
  `;
}

function renderIntentionItem(item) {
  return `
    <button class="experience-file-item ${item.path === currentExperiencePath ? 'is-active' : ''}" type="button" data-path="${escapeAttr(item.path)}">
      <span class="experience-file-kind">${escapeHtml(item.kind.toUpperCase())}</span>
      <strong>${escapeHtml(item.title || item.name)}</strong>
      <span class="experience-file-name">${escapeHtml(item.name)}</span>
    </button>
  `;
}

function renderExperienceForm(item) {
  const disabled = !item;
  Object.values(experienceFields).forEach((field) => { field.disabled = disabled; });
  experienceSaveBtn.disabled = disabled;
  experienceFields.title.value = item?.title || '';
  experienceFields.category.value = item?.category || '';
  experienceFields.role.value = item?.role || '';
  experienceFields.sourceFile.value = item?.sourceFile || '';
  experienceFields.summary.value = item?.summary || '';
  experienceFields.tags.value = (item?.tags || []).join(', ');
  experienceFields.evidence.value = (item?.evidence || []).join('\n');
  experienceFields.gaps.value = (item?.gaps || []).join('\n');
  experienceFields.publicLevel.value = item?.publicLevel || '';
}

function renderExperienceFilePreview(item) {
  if (currentView === 'experience') {
    titleEl.textContent = item?.title || '项目经历文件';
    fileEl.textContent = item?.path || 'mycv/project-notes';
  }
  if (!item) {
    experienceMarkdownPaper.innerHTML = '<div class="empty-state">导入或从右侧选择一个项目经历文件。</div>';
    return;
  }
  experienceMarkdownPaper.innerHTML = item.content
    ? renderMiniMarkdown(item.content)
    : '<div class="empty-state">这条经历还没有源文件内容。</div>';
}

function selectedExperienceFile() {
  return currentExperienceFiles.find((item) => item.path === currentExperiencePath) || null;
}

function selectedHeadshot() {
  return currentHeadshots.find((item) => item.path === currentExperiencePath) || null;
}

function selectedIntention() {
  return currentIntentions.find((item) => item.path === currentExperiencePath) || null;
}

function selectedExperience() {
  if (currentExperienceAssetType === 'photo') return selectedHeadshot();
  if (currentExperienceAssetType === 'intention') return selectedIntention();
  return selectedExperienceFile();
}

function renderHeadshotPreview(item) {
  if (currentView === 'experience') {
    titleEl.textContent = item?.title || '职业照资产';
    fileEl.textContent = item?.path || 'mycv/headshots';
  }
  if (!item) {
    experienceMarkdownPaper.innerHTML = '<div class="empty-state">导入或从右侧选择一张职业照。</div>';
    return;
  }
  experienceMarkdownPaper.innerHTML = `
    <section class="headshot-preview">
      <p class="eyebrow">职业照资产</p>
      <h1>${escapeHtml(item.title || item.name)}</h1>
      <img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(item.title || item.name)}">
      <p>${escapeHtml(item.path)}</p>
    </section>
  `;
}

function renderIntentionPreview(item) {
  if (currentView === 'experience') {
    titleEl.textContent = item?.title || '职业意向偏好资产';
    fileEl.textContent = item?.path || 'mycv/intentions';
  }
  if (!item) {
    experienceMarkdownPaper.innerHTML = '<div class="empty-state">导入或从右侧选择一份职业意向偏好文件。</div>';
    return;
  }
  experienceMarkdownPaper.innerHTML = item.content
    ? renderMiniMarkdown(item.content)
    : '<div class="empty-state">这份职业意向偏好还没有可预览内容。</div>';
}

function renderExperienceDiagnosis(item) {
  if (!item) {
    experienceDiagnosis.innerHTML = '<p class="clue-empty">从左侧选择一条经历。</p>';
    return;
  }
  const detail = experienceDetailModel(item);
  experienceDiagnosis.innerHTML = `
    <div class="diagnosis-block">
      <h4>适合投递的岗位</h4>
      ${renderBulletList(detail.fitRoles)}
    </div>
    <div class="diagnosis-block">
      <h4>这段经历已经证明了什么</h4>
      ${renderBulletList(detail.proves)}
    </div>
    <div class="diagnosis-block">
      <h4>还缺什么证据</h4>
      ${renderBulletList(detail.missingEvidence)}
    </div>
    <div class="diagnosis-block">
      <h4>下一步建议</h4>
      <div class="diagnosis-actions">
        <button class="small-button" type="button" data-experience-action="questions">一键生成补全问题</button>
        <button class="small-button primary-small-button" type="button" data-experience-action="bullets">生成简历描述</button>
        <button class="small-button" type="button" data-experience-action="story">生成面试 STAR 故事</button>
        <button class="small-button" type="button" data-experience-action="add-resume">加入机器人系统工程师简历</button>
      </div>
    </div>
  `;
  experienceDiagnosis.querySelectorAll('[data-experience-action]').forEach((button) => {
    button.addEventListener('click', () => runExperienceAction(button.dataset.experienceAction));
  });
}

function experienceDetailModel(item) {
  const background = markdownSectionText(item.sourceContent, '项目背景')
    || item.summary
    || '项目背景待补充。';
  const role = markdownSectionText(item.sourceContent, '我的角色') || item.role || '角色待补充。';
  const actions = meaningfulItems(markdownSectionItems(item.sourceContent, '我具体做了什么'));
  const results = meaningfulItems(markdownSectionItems(item.sourceContent, '量化结果'));
  const techStack = uniqueList([
    ...markdownSectionItems(item.sourceContent, '技术栈'),
    ...(item.tags || []),
  ]).map(cleanListText).filter(Boolean);
  const fitRoles = fitRolesForExperience(item);
  const missingEvidence = missingEvidenceForExperience(item);
  const proves = provesForExperience(item);

  return {
    background,
    role,
    actions: actions.length ? actions : fallbackActionsForExperience(item),
    techStack: techStack.length ? techStack : (item.tags || []),
    results,
    publicLevel: item.publicLevel || '待补充可公开程度',
    fitRoles,
    missingEvidence,
    proves,
  };
}

function fitRolesForExperience(item) {
  if (item.id === 'exp-ethercat-drop-op') {
    return ['机器人系统工程师', '工业通信', '机器人软件', '现场交付', '具身智能解决方案'];
  }
  if (item.id === 'exp-erob-sdk') {
    return ['机器人软件工程师', 'SDK 工程师', '机器人系统工程师', '开发者生态'];
  }
  if (item.id === 'exp-zeroerr-gpt-rag') {
    return ['RAG 工程师', 'AI 应用工程师', '企业知识库工程师', 'AI 解决方案工程师'];
  }
  return ['具身智能数据基建工程师', '机器人数据工程师', 'AI 应用工程师'];
}

function provesForExperience(item) {
  if (item.id === 'exp-ethercat-drop-op') {
    return [
      '工业通信问题定位能力',
      'EtherCAT / CiA402 / SOEM / IGH 实践经验',
      '多关节系统稳定性测试经验',
      '客户问题闭环能力',
      '跨研发、技术支持、客户现场的信息协同能力',
    ];
  }
  return item.evidence?.length ? item.evidence : ['复杂项目拆解能力', '跨角色协作能力', '可复用工程沉淀能力'];
}

function missingEvidenceForExperience(item) {
  if (item.id === 'exp-ethercat-drop-op') {
    return ['从站数量', '控制周期', '复现次数', '故障率变化', '最终解决方案', '客户反馈或交付结果'];
  }
  return item.gaps?.length ? item.gaps : ['量化结果', '截图或链接', '最终交付影响'];
}

function fallbackActionsForExperience(item) {
  if (item.id === 'exp-ethercat-drop-op') {
    return [
      '搭建多关节 EtherCAT 测试环境',
      '对比 SOEM 和 IGH 主站行为',
      '分析 DC Sync、SM Sync、PDO/SDO、CiA402 状态机',
      '跟进 0xA000 主站掉线等问题',
      '输出客户使用建议和研发排查线索',
    ];
  }
  return item.evidence?.length ? item.evidence : ['补充关键动作后，这里会生成可用于简历的素材。'];
}

function markdownSectionText(markdown, title) {
  return markdownSectionLines(markdown, title)
    .filter((line) => line && !line.startsWith('- '))
    .join('\n')
    .trim();
}

function markdownSectionItems(markdown, title) {
  return markdownSectionLines(markdown, title)
    .map(cleanListText)
    .filter(Boolean);
}

function markdownSectionLines(markdown, title) {
  const lines = String(markdown || '').split(/\r?\n/);
  const start = lines.findIndex((line) => normalizeHeading(line).includes(title));
  if (start < 0) return [];
  const out = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,3}\s+/.test(lines[index])) break;
    if (lines[index].trim()) out.push(lines[index].trim());
  }
  return out;
}

function normalizeHeading(line) {
  return String(line || '').replace(/^#{1,3}\s*/, '').replace(/^\d+\.\s*/, '').trim();
}

function cleanListText(text) {
  return String(text || '').replace(/^[-*]\s*/, '').replace(/：$/, '').trim();
}

function meaningfulItems(items) {
  return items.filter((item) => item && !item.includes('待补充'));
}

function uniqueList(items) {
  return [...new Set(items.map(cleanListText).filter(Boolean))];
}

function experienceCard(title, body) {
  return `
    <section class="experience-asset-card">
      <h4>${escapeHtml(title)}</h4>
      ${body}
    </section>
  `;
}

function renderBulletList(items) {
  if (!items?.length) return '<p class="clue-empty">待补充。</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderTagSet(items) {
  if (!items?.length) return '<div class="experience-tags"><span>待补充</span></div>';
  return `<div class="experience-tags">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

function runExperienceAction(action) {
  if (action === 'questions') return generateEvidenceQuestions();
  if (action === 'bullets') return generateResumeBullets();
  if (action === 'story') return generateInterviewStory();
  if (action === 'add-resume') return addToTargetResume();
  if (action === 'diagnosis') return rerunDiagnosis();
}

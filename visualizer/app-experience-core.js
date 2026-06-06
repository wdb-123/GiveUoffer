async function loadExperienceMetadata() {
  if (currentView === 'experience') setStatus('读取经历文件');
  const [data, profileData] = await Promise.all([
    VisualizerApi.getExperienceFiles(),
    VisualizerApi.getExperienceProfile().catch(() => ({ profile: null })),
  ]);
  currentExperienceFiles = data.files || [];
  currentHeadshots = data.photos || [];
  currentIntentions = data.intentions || [];
  currentExperienceProfile = profileData.profile || null;
  const currentPathExists = [...currentExperienceFiles, ...currentHeadshots, ...currentIntentions].some((item) => item.path === currentExperiencePath);
  if (!currentExperiencePath || !currentPathExists) {
    currentExperiencePath = '__profile__';
    currentExperienceAssetType = 'profile';
  }
  if (currentExperiencePath === '__profile__') {
    currentExperienceAssetType = 'profile';
  } else if (!currentExperienceFiles.some((item) => item.path === currentExperiencePath) && currentHeadshots.some((item) => item.path === currentExperiencePath)) {
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
      : currentExperienceAssetType === 'profile'
        ? null
        : selectedExperienceFile();
  if (experienceFileCount) experienceFileCount.textContent = `${currentExperienceFiles.length} 个`;
  if (headshotCount) headshotCount.textContent = `${currentHeadshots.length} 个`;
  if (intentionCount) intentionCount.textContent = `${currentIntentions.length} 个`;
  experienceProfileList.innerHTML = renderExperienceProfileItem();
  experienceProfileList.querySelector('[data-path="__profile__"]')?.addEventListener('click', () => {
    currentExperiencePath = '__profile__';
    currentExperienceAssetType = 'profile';
    experienceGeneratedOutput.hidden = true;
    renderExperienceMetadata();
  });
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
  if (currentExperienceAssetType === 'profile') renderExperienceProfilePreview();
  else if (currentExperienceAssetType === 'photo') renderHeadshotPreview(selected);
  else if (currentExperienceAssetType === 'intention') renderIntentionPreview(selected);
  else renderExperienceFilePreview(selected);
}

function renderExperienceProfileItem() {
  return `
    <button class="experience-file-item experience-profile-item ${currentExperienceAssetType === 'profile' ? 'is-active' : ''}" type="button" data-path="__profile__">
      <span class="experience-file-kind">画像</span>
      <strong>职业画像总览</strong>
      <span class="experience-file-name">根据经历资产自动判断</span>
    </button>
  `;
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
  if (currentExperienceAssetType === 'profile') return null;
  if (currentExperienceAssetType === 'photo') return selectedHeadshot();
  if (currentExperienceAssetType === 'intention') return selectedIntention();
  return selectedExperienceFile();
}

function renderExperienceProfilePreview() {
  if (currentView === 'experience') {
    titleEl.textContent = '职业画像总览';
    fileEl.textContent = '基于经历资产 / 职业照 / 职业偏好';
  }
  const profile = buildExperienceProfileModel();
  experienceMarkdownPaper.innerHTML = `
    <section class="experience-profile-overview">
      <p class="eyebrow">职业画像</p>
      <h1>${escapeHtml(profile.headline)}</h1>
      <p class="profile-summary">${escapeHtml(profile.summary)}</p>
      <div class="profile-stat-grid">
        ${profile.stats.map((item) => `
          <div>
            <strong>${escapeHtml(item.value)}</strong>
            <span>${escapeHtml(item.label)}</span>
          </div>
        `).join('')}
      </div>
      ${experienceCard('判断过程', renderProfileReasoning(profile))}
      ${experienceCard('核心画像', renderBulletList(profile.persona))}
      ${experienceCard('适合优先投递的岗位', renderBulletList(profile.fitRoles))}
      ${experienceCard('简历生成时应该突出', renderBulletList(profile.resumeFocus))}
      ${experienceCard('当前证据缺口', renderBulletList(profile.gaps))}
    </section>
  `;
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
  experienceDiagnosis.innerHTML = '';
}

function buildExperienceProfileModel() {
  if (currentExperienceProfile) return normalizeExperienceProfileModel(currentExperienceProfile);
  const experiences = currentExperienceData?.experiences?.length
    ? currentExperienceData.experiences
    : currentExperienceFiles;
  const sourceText = currentExperienceFiles.map((item) => [item.title, item.name, item.content].join('\n')).join('\n');
  const tags = uniqueList([
    ...experiences.flatMap((item) => item.tags || []),
    ...inferProfileTags(sourceText),
  ]);
  const categories = uniqueList([
    ...experiences.map((item) => item.category),
    ...inferProfileCategories(sourceText),
  ]);
  const evidence = uniqueList([
    ...experiences.flatMap((item) => item.evidence || []),
    ...currentExperienceFiles.flatMap((item) => extractProfileEvidence(item.content)),
  ]);
  const gaps = uniqueList([
    ...experiences.flatMap((item) => item.gaps || []),
    ...inferProfileGaps(sourceText),
  ]);
  const titles = experiences.map((item) => item.title).filter(Boolean);
  const hasRobot = /机器人|ROS|EtherCAT|CAN|MoveIt|URDF|CiA402|SDK/i.test(`${tags.join(' ')} ${categories.join(' ')} ${titles.join(' ')}`);
  const hasAi = /RAG|Agent|AI|知识|检索|FastAPI|OpenAI/i.test(`${tags.join(' ')} ${categories.join(' ')} ${titles.join(' ')}`);
  const hasData = /数据|Pipeline|DataOps|DVC|MinIO|Label/i.test(`${tags.join(' ')} ${categories.join(' ')} ${titles.join(' ')}`);
  const headline = hasRobot
    ? '机器人系统软件 / 工业通信 / AI 工程化复合型候选人'
    : '工程项目型候选人画像';
  const summaryParts = [
    `系统读取了 ${currentExperienceFiles.length} 份项目经历文件`,
    currentHeadshots.length ? `${currentHeadshots.length} 份职业照资产` : '',
    currentIntentions.length ? `${currentIntentions.length} 份职业偏好资产` : '',
  ].filter(Boolean);
  const persona = [
    hasRobot ? '主线能力集中在机器人软件、工业通信、关节模组 SDK、系统联调和客户问题闭环。' : '主线能力来自工程项目拆解、交付协同和技术沉淀。',
    hasAi ? '具备企业级 RAG / Agent / 知识治理经验，可把机器人产品知识转成 AI 工具链能力。' : '',
    hasData ? '对机器人数据闭环、日志/状态/动作数据治理和具身智能数据基建有延展方向。' : '',
    '更适合强调“现场问题复现 -> 技术定位 -> 文档/工具沉淀 -> 支撑交付”的工程闭环，而不是泛泛包装成算法研究型候选人。',
  ].filter(Boolean);
  const fitRoles = [
    '机器人系统工程师 / 机器人软件工程师',
    '机器人 SDK / 工业通信 / 控制系统集成方向',
    hasAi ? 'AI 工具链 / RAG 工程 / 机器人知识系统方向' : '',
    hasData ? '具身智能数据工程 / 机器人数据 Pipeline 方向' : '',
    '技术支持型解决方案工程师（偏机器人系统与客户问题闭环）',
  ].filter(Boolean);
  const resumeFocus = [
    '优先突出 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、CiA402、SOEM / IGH 等硬技能。',
    '项目排序建议：SDK 生态与系统集成优先，其次 EtherCAT 稳定性测试，再补 RAG / Agent 工程化作为差异化。',
    '表达方式应偏“工程问题闭环”和“可复用交付资产”，少写空泛自我评价。',
    '生成岗位简历时，根据 JD 自动选择机器人系统、AI 工具链或数据 Pipeline 作为主叙事。',
  ];
  return {
    headline,
    summary: `${summaryParts.join('、')}，并结合标签、项目标题、证据项和缺口项，判断候选人的求职画像与简历生成策略。`,
    stats: [
      { value: `${currentExperienceFiles.length}`, label: '项目经历' },
      { value: `${tags.length}`, label: '技能标签' },
      { value: `${evidence.length}`, label: '可用证据' },
      { value: `${gaps.length}`, label: '待补证据' },
    ],
    persona,
    fitRoles,
    resumeFocus,
    gaps: gaps.length ? gaps.slice(0, 6) : ['补充量化指标、项目截图、公开链接、客户反馈和最终结果。'],
    categories: categories.slice(0, 6),
    tags: tags.slice(0, 12),
    evidence: evidence.slice(0, 6),
  };
}

function normalizeExperienceProfileModel(profile) {
  const fallback = {
    headline: '职业画像总览',
    summary: '根据导入的个人信息生成职业画像。',
    persona: [],
    fitRoles: [],
    resumeFocus: [],
    gaps: [],
    reasoning: [],
    tags: [],
    categories: [],
    evidence: [],
  };
  const normalized = { ...fallback, ...(profile || {}) };
  return {
    ...normalized,
    stats: [
      { value: `${currentExperienceFiles.length}`, label: '项目经历' },
      { value: `${(normalized.tags || []).length}`, label: '技能标签' },
      { value: `${(normalized.evidence || []).length}`, label: '可用证据' },
      { value: `${(normalized.gaps || []).length}`, label: '待补证据' },
    ],
    persona: stringListValue(normalized.persona),
    fitRoles: stringListValue(normalized.fitRoles),
    resumeFocus: stringListValue(normalized.resumeFocus),
    gaps: stringListValue(normalized.gaps),
    reasoning: stringListValue(normalized.reasoning),
    tags: stringListValue(normalized.tags),
    categories: stringListValue(normalized.categories),
    evidence: stringListValue(normalized.evidence),
  };
}

function inferProfileTags(text) {
  const candidates = [
    'EtherCAT', 'CANopen', 'CAN', 'ROS2', 'ROS', 'MoveIt', 'URDF', 'CiA402',
    'PDO / SDO', 'SOEM', 'IGH EtherCAT', 'RT-Linux', 'DC Sync', 'SM Sync',
    'RAG', 'Agent', 'FastAPI', 'Evidence API', 'OpenAI-compatible API',
    'DataOps', 'DVC', 'MinIO', 'Label Studio', '机器人系统', 'SDK', '具身智能',
  ];
  return candidates.filter((term) => String(text || '').toLowerCase().includes(term.toLowerCase()));
}

function inferProfileCategories(text) {
  const value = String(text || '');
  return [
    /EtherCAT|CANopen|CiA402|SOEM|IGH/.test(value) ? '机器人系统 / 工业通信' : '',
    /SDK|ROS2|MoveIt|URDF|开发者文档/.test(value) ? '机器人软件 / SDK' : '',
    /RAG|Agent|知识|检索|Evidence API/.test(value) ? '企业级 AI / RAG / Agent' : '',
    /数据|Pipeline|DataOps|DVC|Label Studio/.test(value) ? '具身智能数据基建' : '',
  ].filter(Boolean);
}

function extractProfileEvidence(markdown) {
  const sections = ['量化结果', '我具体做了什么', '技术栈'];
  return uniqueList(sections.flatMap((section) => markdownSectionItems(markdown, section)))
    .filter((item) => !item.includes('待补充'))
    .slice(0, 8);
}

function inferProfileGaps(text) {
  const value = String(text || '');
  const gaps = [];
  if (/从站数量|控制周期|日志|客户现场|掉 OP|EtherCAT/.test(value)) gaps.push('补充从站数量、控制周期、复现次数、日志证据和最终定位结论。');
  if (/SDK|API|Demo|开发者文档/.test(value)) gaps.push('补充 SDK 模块边界、API 清单、Demo 数量、测试脚本和客户接入案例。');
  if (/RAG|Agent|知识库|检索/.test(value)) gaps.push('补充可公开架构图、评测截图、API 文档和脱敏真实问题闭环。');
  if (/Pipeline|数据|DataOps|标注|质检/.test(value)) gaps.push('补齐可运行数据 Pipeline、样本数据、版本管理、标注质检和评测截图。');
  return gaps;
}

function renderProfileReasoning(profile) {
  if (profile.reasoning?.length) return renderBulletList(profile.reasoning);
  return `
    <ul>
      <li>根据项目类别判断主线：${escapeHtml(profile.categories.join('、') || '待补充')}。</li>
      <li>根据技能标签识别能力簇：${escapeHtml(profile.tags.join('、') || '待补充')}。</li>
      <li>根据证据项判断可写入简历的强证据：${escapeHtml(profile.evidence.join('；') || '待补充')}。</li>
      <li>根据缺口项判断下一步补证据方向，避免把规划或待补材料写成已完成成果。</li>
    </ul>
  `;
}

function stringListValue(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
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

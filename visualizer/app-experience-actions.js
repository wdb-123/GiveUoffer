function generateResumeBullets() {
  const item = selectedExperience();
  if (!item) return;
  const detail = experienceDetailModel(item);
  renderGeneratedOutput('简历条目 · 3 种风格', `
    ${generatedBlock('技术型', [
      `围绕${detail.techStack.slice(0, 4).join(' / ')}开展${item.title}，定位多关节系统稳定性、状态机切换与主站通信异常问题，沉淀可复用排查线索。`,
    ])}
    ${generatedBlock('业务交付型', [
      `面向客户交付中的${item.category}问题，参与复现、测试分析与跨团队闭环，推动问题从现场现象转化为研发排查依据和客户使用建议。`,
    ])}
    ${generatedBlock('机器人系统工程师岗位型', [
      `参与${item.title}，分析 EtherCAT 主站、CiA402 状态机、同步机制和多关节调度问题，支撑机器人系统稳定性验证与现场问题闭环。`,
    ])}
  `);
}

function generateInterviewStory() {
  const item = selectedExperience();
  if (!item) return;
  const detail = experienceDetailModel(item);
  renderGeneratedOutput('面试 STAR 故事', `
    ${generatedBlock('Situation', [detail.background])}
    ${generatedBlock('Task', [`我需要把现场不稳定现象拆成可复现、可分析、可推动研发定位的问题，并形成对客户有用的结论。`])}
    ${generatedBlock('Action', detail.actions.slice(0, 5))}
    ${generatedBlock('Result', detail.results.length ? detail.results : ['结果数据待补充：建议补齐从站数量、控制周期、复现次数、最终解决方案和客户反馈。'])}
  `);
}

function generateEvidenceQuestions() {
  renderGeneratedOutput('补全问题', generatedBlock('请补充这些信息', [
    '当时一共有多少个 EtherCAT 从站？',
    '控制周期是多少？',
    '使用的是 SOEM 还是 IGH？',
    '是否开启 DC 同步？',
    '问题复现频率是多少？',
    '最终定位到哪些可能原因？',
    '最终给客户或研发输出了什么结论？',
    '这个问题是否形成了文档、测试脚本或使用规范？',
  ]));
}

function rerunDiagnosis() {
  renderExperienceDiagnosis(selectedExperience());
  renderGeneratedOutput('重新诊断', '<p>已基于当前元数据重新生成岗位匹配诊断。后续可在这里接入 AI 后端。</p>');
}

function addToTargetResume() {
  renderGeneratedOutput('加入目标简历', '<p>已模拟加入“机器人系统工程师”简历版本。后续可接入简历版本写入接口。</p>');
}

function renderGeneratedOutput(title, html) {
  experienceGeneratedOutput.hidden = false;
  experienceGeneratedTitle.textContent = title;
  experienceGeneratedBody.innerHTML = html;
}

function generatedBlock(title, items) {
  return `
    <section class="generated-block">
      <h4>${escapeHtml(title)}</h4>
      ${renderBulletList(items)}
    </section>
  `;
}

function renderExperienceVersions(versions) {
  experienceVersions.innerHTML = versions.length
    ? versions.slice(0, 12).map((item) => `
      <article class="experience-version-item action-${escapeAttr(item.action)}">
        <div>
          <strong>${escapeHtml(versionActionLabel(item.action))} · ${escapeHtml(item.title || item.itemId)}</strong>
          <span>${escapeHtml(formatDateTime(item.changedAt))}</span>
        </div>
        <p>${escapeHtml(versionSummary(item))}</p>
      </article>
    `).join('')
    : '<div class="empty-state">还没有经历元数据版本记录。</div>';
}

function showExperienceProfile() {
  currentExperiencePath = '__profile__';
  currentExperienceAssetType = 'profile';
  experienceGeneratedOutput.hidden = true;
  renderExperienceMetadata();
  setStatus('显示职业画像');
}

async function generateExperienceProfile() {
  if (!experienceProfileGenerateBtn) return;
  experienceProfileGenerateBtn.disabled = true;
  experienceProfileGenerateBtn.textContent = '画像生成中...';
  experienceStatus.textContent = '正在根据导入的个人信息生成职业画像...';
  setStatus('生成职业画像');
  try {
    const result = await VisualizerApi.generateExperienceProfile();
    currentExperienceProfile = result.profile || null;
    currentExperiencePath = '__profile__';
    currentExperienceAssetType = 'profile';
    experienceGeneratedOutput.hidden = true;
    renderExperienceMetadata();
    experienceStatus.textContent = `职业画像已生成：${formatDateTime(result.updatedAt)}`;
    setStatus('职业画像已生成');
  } catch (err) {
    experienceStatus.textContent = `画像生成失败：${err.message || err}`;
    setStatus('画像生成失败');
  } finally {
    experienceProfileGenerateBtn.disabled = false;
    experienceProfileGenerateBtn.textContent = '生成职业画像';
  }
}

function versionActionLabel(action) {
  const labels = { created: '新增', updated: '更新', deleted: '删除' };
  return labels[action] || action || '变更';
}

function versionSummary(item) {
  if (item.action === 'deleted') return '删除了这条经历元数据。';
  if (item.action === 'created') return firstMeaningfulLine(item.after) || '新增了这条经历元数据。';
  return firstChangedLine(item.before, item.after) || '更新了经历元数据字段。';
}

function firstMeaningfulLine(text) {
  return String(text || '').split(/\r?\n/).find((line) => line.trim() && !line.endsWith('：')) || '';
}

function firstChangedLine(before, after) {
  const beforeLines = String(before || '').split(/\r?\n/);
  const afterLines = String(after || '').split(/\r?\n/);
  return afterLines.find((line, index) => line !== beforeLines[index]) || '';
}

async function importExperienceFiles() {
  const files = [...(experienceImportInput.files || [])];
  if (!files.length) return;
  setStatus('导入经历文件');
  for (const file of files) {
    const contentBase64 = await fileToBase64(file);
    const result = await VisualizerApi.importExperienceFile({ name: file.name, contentBase64 });
    currentExperienceFiles = result.files || currentExperienceFiles;
    currentHeadshots = result.photos || currentHeadshots;
    currentIntentions = result.intentions || currentIntentions;
    currentExperiencePath = result.path || currentExperiencePath;
    currentExperienceAssetType = 'file';
  }
  experienceImportInput.value = '';
  renderExperienceMetadata();
  setStatus('经历已导入');
}

async function importHeadshotFiles() {
  const files = [...(headshotImportInput.files || [])];
  if (!files.length) return;
  setStatus('导入职业照');
  for (const file of files) {
    const contentBase64 = await fileToBase64(file);
    const result = await VisualizerApi.importExperienceFile({ name: file.name, contentBase64 });
    currentExperienceFiles = result.files || currentExperienceFiles;
    currentHeadshots = result.photos || currentHeadshots;
    currentIntentions = result.intentions || currentIntentions;
    currentExperiencePath = result.path || currentExperiencePath;
    currentExperienceAssetType = 'photo';
  }
  headshotImportInput.value = '';
  renderExperienceMetadata();
  setStatus('职业照已导入');
}

async function importIntentionFiles() {
  const files = [...(intentionImportInput?.files || [])];
  if (!files.length) return;
  setStatus('导入职业意向偏好');
  for (const file of files) {
    const contentBase64 = await fileToBase64(file);
    const result = await VisualizerApi.importExperienceFile({ name: file.name, contentBase64, assetType: 'intention' });
    currentExperienceFiles = result.files || currentExperienceFiles;
    currentHeadshots = result.photos || currentHeadshots;
    currentIntentions = result.intentions || currentIntentions;
    currentExperiencePath = result.path || currentExperiencePath;
    currentExperienceAssetType = 'intention';
  }
  intentionImportInput.value = '';
  renderExperienceMetadata();
  setStatus('职业意向偏好已导入');
}

function commitExperienceForm() {
  const item = selectedExperience();
  if (!item) return;
  item.title = experienceFields.title.value.trim();
  item.category = experienceFields.category.value.trim();
  item.role = experienceFields.role.value.trim();
  item.sourceFile = experienceFields.sourceFile.value.trim();
  item.summary = experienceFields.summary.value.trim();
  item.tags = splitInlineList(experienceFields.tags.value);
  item.evidence = splitLineList(experienceFields.evidence.value);
  item.gaps = splitLineList(experienceFields.gaps.value);
  item.publicLevel = experienceFields.publicLevel.value.trim();
}

async function saveExperienceMetadata() {
  commitExperienceForm();
  experienceSaveBtn.disabled = true;
  experienceStatus.textContent = '保存经历元数据...';
  setStatus('保存经历');
  try {
    const result = await VisualizerApi.saveExperienceMetadata({ metadata: currentExperienceData });
    currentExperienceData = {
      updatedAt: result.updatedAt || '',
      experiences: result.experiences || [],
      versions: result.versions || [],
    };
    renderExperienceMetadata();
    experienceStatus.textContent = `已保存，新增 ${result.saved || 0} 条版本记录。`;
    setStatus('经历已保存');
  } catch (err) {
    experienceStatus.textContent = `保存失败：${err.message || err}`;
    setStatus('保存失败');
  } finally {
    experienceSaveBtn.disabled = !selectedExperience();
  }
}

function splitInlineList(value) {
  return String(value || '').split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function splitLineList(value) {
  return String(value || '').split(/\r?\n/).map((item) => item.trim().replace(/^[-*]\s*/, '')).filter(Boolean);
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

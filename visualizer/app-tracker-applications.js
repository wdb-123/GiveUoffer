async function loadApplications() {
  if (currentView === 'applications') setStatus('读取投递进度');
  const data = await VisualizerApi.listApplications();
  currentApplicationsData = data.applications || [];
  renderApplications(data.applications || [], data.metrics || {}, data.todos || [], data.feedback || []);
  if (currentView === 'applications') setStatus('已更新');
}

function setApplicationImportSource(source) {
  currentApplicationImportSource = source || 'email';
  document.querySelectorAll('[data-import-source]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.importSource === currentApplicationImportSource);
  });
}

function clearApplicationImport() {
  if (applicationImportText) applicationImportText.value = '';
  if (applicationImportResult) {
    applicationImportResult.innerHTML = '<div class="empty-state">识别出的事件、下一步动作和入库命令会显示在这里。先粘贴一封邮件并点击“解析进度”。</div>';
  }
  setStatus('等待导入');
}

function parseApplicationImport() {
  const raw = applicationImportText?.value?.trim() || '';
  if (!raw) {
    applicationImportResult.innerHTML = '<div class="empty-state">请先粘贴一封招聘邮件原文，再进行解析。</div>';
    setStatus('没有可解析内容');
    return;
  }

  const proposal = buildApplicationImportProposal(raw, currentApplicationImportSource);
  latestApplicationImportProposal = proposal;
  applicationImportResult.innerHTML = renderApplicationImportResult(proposal);
  applicationImportResult.querySelector('[data-copy-import-command]')?.addEventListener('click', async (event) => {
    await navigator.clipboard.writeText(event.currentTarget.dataset.copyImportCommand);
    event.currentTarget.textContent = '已复制';
    setStatus('已复制入库命令');
  });
  applicationImportResult.querySelector('[data-save-import-event]')?.addEventListener('click', saveApplicationImportEvent);
  setStatus('已解析投递进度');
}

async function saveApplicationImportEvent(event) {
  if (!latestApplicationImportProposal) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = '保存中';
  try {
    const item = latestApplicationImportProposal;
    const result = await VisualizerApi.saveApplicationEvent({
      application_id: item.matched?.id || '',
      company: item.companyHint,
      role: item.roleHint,
      event: item.event,
      source: item.source,
      next_action: item.nextAction,
      due: item.due,
      note: item.evidence,
      evidence: item.evidence,
    });
    button.textContent = '已入库';
    setStatus(`已记录 #${result.event.application_id} ${importEventLabel(result.event.event)}`);
    await loadApplications();
  } catch (err) {
    button.disabled = false;
    button.textContent = '确认入库';
    setStatus(`入库失败：${err.message || err}`);
  }
}

function buildApplicationImportProposal(raw, source) {
  const text = raw.replace(/\r\n/g, '\n');
  const compact = text.replace(/\s+/g, ' ').trim();
  const subject = firstLineMatch(text, /^subject:\s*(.+)$/im);
  const from = firstLineMatch(text, /^from:\s*(.+)$/im);
  const due = extractImportDueDate(text);
  const event = detectImportEvent(text, source);
  const nextAction = importNextAction(event);
  const companyHint = extractCompanyHint(text, from, source);
  const roleHint = extractRoleHint(text, subject);
  const matched = matchExistingApplication(text, from, companyHint, roleHint);
  const confidence = importConfidence({ subject, from, matched, event, due });
  const command = buildImportCommand({ matched, event, nextAction, due, source, compact });

  return {
    source,
    event,
    nextAction,
    due,
    subject,
    from,
    matched,
    companyHint,
    roleHint,
    confidence,
    evidence: compact.slice(0, 260),
    command,
  };
}

function detectImportEvent(text, source) {
  if (/(offer|录用|录取|聘用|发放\s*offer|oc\b)/i.test(text)) return 'offer';
  if (/(interview|面试|面邀|面談|约面|面试邀请|面试安排)/i.test(text)) return 'interview';
  if (/(assessment|coding challenge|test|笔试|测评|在线测验|测验|机试)/i.test(text)) return 'assessment';
  if (/(unfortunately|regret|not move forward|不合适|遗憾|未能进入|暂不匹配|感谢.*投递)/i.test(text)) return 'rejected';
  if (/(received your application|application received|投递成功|已收到.*简历|感谢.*申请|网申成功)/i.test(text)) return 'application_received';
  if (source === 'manual') return 'note';
  return 'responded';
}

function importNextAction(event) {
  const actions = {
    application_received: '等待招聘方回复',
    responded: '整理招聘方问题并回复',
    assessment: '在截止时间前完成测评/笔试',
    interview: '预约或准备面试',
    offer: '进入 Offer 评估和谈薪',
    rejected: '记录拒绝原因并复盘岗位方向',
    note: '人工确认后更新 tracker',
  };
  return actions[event] || actions.note;
}

function extractImportDueDate(text) {
  const iso = firstLineMatch(text, /(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso;
  const slash = text.match(/(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
  }
  const chinese = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (chinese) {
    const year = new Date().getFullYear();
    return `${year}-${chinese[1].padStart(2, '0')}-${chinese[2].padStart(2, '0')}`;
  }
  return '';
}

function matchExistingApplication(text, from, companyHint = '', roleHint = '') {
  const haystack = `${text} ${from || ''}`.replace(/\s+/g, '').toLowerCase();
  const normalizedCompanyHint = normalizeImportText(companyHint);
  const hasExplicitCompany = normalizedCompanyHint
    && !['待确认公司', 'boss/脉脉消息待确认'].includes(String(companyHint || '').toLowerCase());

  if (hasExplicitCompany) {
    return currentApplicationsData.find((app) => {
      const company = normalizeImportText(app.company);
      return company && (normalizedCompanyHint.includes(company) || company.includes(normalizedCompanyHint) || haystack.includes(company));
    }) || null;
  }

  const roleMatches = currentApplicationsData.filter((app) => {
    const company = String(app.company || '').replace(/\s+/g, '').toLowerCase();
    if (company && haystack.includes(company)) return true;
    const role = String(app.role || '').replace(/\s+/g, '').toLowerCase();
    const normalizedRoleHint = normalizeImportText(roleHint);
    return role && role.length >= 8 && (haystack.includes(role) || normalizedRoleHint.includes(role));
  });
  return roleMatches.length === 1 ? roleMatches[0] : null;
}

function extractCompanyHint(text, from, source) {
  const companyFromLine = firstLineMatch(text, /(?:公司|Company|企业)[:：]\s*([^\n]+)/i);
  if (companyFromLine) return companyFromLine.slice(0, 28);
  const chineseCompany = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,40}(?:股份有限公司|有限公司))/);
  if (chineseCompany) return chineseCompany[1].slice(0, 40);
  if (from) {
    const domain = firstLineMatch(from, /@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
    if (domain) return domain.split('.')[0];
  }
  if (source === 'boss') return 'Boss/脉脉消息待确认';
  return '待确认公司';
}

function extractRoleHint(text, subject) {
  const roleFromLine = firstLineMatch(text, /(?:岗位|职位|Role|Position)[:：]\s*([^\n]+)/i);
  if (roleFromLine) return roleFromLine.slice(0, 36);
  const inviteRole = firstLineMatch(text, /参加\s*([^\n，。；]{3,48}?(?:工程师|经理|负责人|专家|实习生|开发|产品|算法|测试|运维|架构师)[^\n，。；]{0,24})\s*职位/);
  if (inviteRole) return inviteRole.slice(0, 48);
  if (subject) return subject.replace(/^(re:|fw:)\s*/i, '').slice(0, 36);
  return '待确认岗位';
}

function normalizeImportText(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function firstLineMatch(text, regex) {
  const match = text.match(regex);
  return match ? (match[1] || match[0]).trim() : '';
}

function importConfidence({ subject, from, matched, event, due }) {
  let score = 0;
  if (matched) score += 2;
  if (subject) score += 1;
  if (from) score += 1;
  if (event !== 'responded' && event !== 'note') score += 1;
  if (due) score += 1;
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function buildImportCommand({ matched, event, nextAction, due, source, compact }) {
  const id = matched?.id || '{自动生成进度编号}';
  const parts = [
    'node tracker-workflow.mjs',
    '--add-event',
    id,
    '--event',
    event,
    '--source',
    source || 'manual_import',
    '--next-action',
    shellQuote(nextAction),
  ];
  if (due) parts.push('--due', due);
  parts.push('--note', shellQuote(compact.slice(0, 120)));
  return parts.join(' ');
}

function renderApplicationImportResult(item) {
  const matchedText = item.matched
    ? `#${escapeHtml(item.matched.id)} · ${escapeHtml(item.matched.company)} · ${escapeHtml(item.matched.role)}`
    : '新邮箱进度记录，确认后创建独立投递进度记录';
  return `
    <div class="import-result-card confidence-${escapeAttr(item.confidence)}">
      <div class="import-result-head">
        <div>
          <p class="eyebrow">解析结果</p>
          <h4>${escapeHtml(importEventLabel(item.event))}</h4>
        </div>
        <span class="confidence-pill">${escapeHtml(importConfidenceLabel(item.confidence))}</span>
      </div>
      <dl class="import-result-grid">
        <div><dt>匹配记录</dt><dd>${matchedText}</dd></div>
        <div><dt>公司</dt><dd>${escapeHtml(item.companyHint)}</dd></div>
        <div><dt>岗位</dt><dd>${escapeHtml(item.roleHint)}</dd></div>
        <div><dt>截止/行动日</dt><dd>${escapeHtml(item.due || '待确认')}</dd></div>
        <div><dt>下一步</dt><dd>${escapeHtml(item.nextAction)}</dd></div>
        <div><dt>来源</dt><dd>${escapeHtml(importSourceLabel(item.source))}</dd></div>
      </dl>
      <div class="import-primary-actions">
        <button class="small-button primary-small-button" type="button" data-save-import-event="true">确认写入进度</button>
        <button class="small-button" type="button" data-copy-import-command="${escapeAttr(item.command)}">复制命令</button>
      </div>
      <div class="import-evidence">${escapeHtml(item.evidence)}</div>
      <div class="import-command-box">
        <code>${escapeHtml(item.command)}</code>
      </div>
      <p class="import-safety-note">确认后只写入投递进度库，不会写入岗位机会雷达，也不会修改简历资产。</p>
    </div>
  `;
}

function importEventLabel(event) {
  const labels = {
    applied: '已手工记录投递',
    application_received: '投递成功 / 已收到申请',
    responded: '招聘方已回复',
    assessment: '测评 / 笔试通知',
    interview: '面试邀请',
    offer: 'Offer / 录用推进',
    rejected: '拒绝 / 暂不匹配',
    discarded: '已放弃',
    skip: '不投',
    followup_sent: '已跟进',
    note: '手动备注',
  };
  return labels[event] || event;
}

function importConfidenceLabel(confidence) {
  const labels = { high: '高置信', medium: '需确认', low: '低置信' };
  return labels[confidence] || confidence;
}

function importSourceLabel(source) {
  const labels = { email: '邮箱', boss: 'Boss/脉脉', linkedin: 'LinkedIn', manual: '手动备注' };
  return labels[source] || source;
}

function renderApplications(applications, metrics, todos = [], feedback = []) {
  applicationMetrics?.remove();
  applicationTodos?.closest('.today-todo-panel')?.remove();
  applicationFeedback?.closest('.feedback-review-panel')?.remove();

  const manualPipeline = applications
    .filter(hasActualPipelineProgress)
    .sort((a, b) => applicationStageIndex(progressStatusKey(b)) - applicationStageIndex(progressStatusKey(a)) || b.score - a.score);
  const manualApplied = manualPipeline.filter((app) => ['applied', 'responded', 'interview', 'offer'].includes(progressStatusKey(app))).length;
  const manualResponded = manualPipeline.filter((app) => ['responded', 'interview', 'offer'].includes(progressStatusKey(app))).length;
  const manualInterview = manualPipeline.filter((app) => ['interview', 'offer'].includes(progressStatusKey(app))).length;
  const manualOffer = manualPipeline.filter((app) => progressStatusKey(app) === 'offer').length;
  const responseRate = manualApplied ? Math.round((manualResponded / manualApplied) * 100) : 0;

  if (applicationMetrics) applicationMetrics.innerHTML = '';

  priorityJobs.innerHTML = manualPipeline.length
    ? manualPipeline.map(renderProgressCard).join('')
    : '<div class="empty-state">还没有导入的投递进度。先解析一封真实邮件，确认入库后，这里才会形成你的投递时间线。</div>';

  priorityJobs.querySelectorAll('[data-edit-application-event]').forEach((button) => {
    button.addEventListener('click', () => editApplicationEvent(button.dataset.editApplicationEvent));
  });
  priorityJobs.querySelectorAll('[data-delete-application-event]').forEach((button) => {
    button.addEventListener('click', () => deleteApplicationEvent(button.dataset.deleteApplicationEvent));
  });

  if (applicationTodos) {
    applicationTodos.innerHTML = todos.length
      ? todos.map(renderTodoItem).join('')
      : '<div class="empty-state">今天没有明确待办。继续导入新邮件后，这里会自动生成跟进、截止和面试准备动作。</div>';
  }

  if (applicationFeedback) {
    applicationFeedback.innerHTML = feedback.length
      ? feedback.map(renderFeedbackCard).join('')
      : '<div class="empty-state">还没有足够反馈。导入拒信、无回复跟进或面试邀请后，这里会生成复盘建议。</div>';
  }

  if (allJobs) allJobs.innerHTML = renderApplicationInsights(applications, metrics, responseRate, {
    manualApplied,
    manualResponded,
    manualInterview,
    manualOffer,
  });
}

function hasActualPipelineProgress(app) {
  if (Number(app.eventCount || 0) > 0) return true;
  return !['evaluated', 'skip', 'discarded', 'unknown', ''].includes(app.statusKey);
}

function progressStatusKey(app) {
  return app.progressStatusKey || app.statusKey || 'unknown';
}

function renderProgressCard(app) {
  const statusKey = progressStatusKey(app);
  const stage = applicationStage(statusKey);
  const label = progressStatusLabel(app);
  return `
    <article class="job-card progress-job-card">
      <div class="job-card-head">
        <div>
          <span class="tracker-id">#${escapeHtml(app.id)}</span>
          <h4>${escapeHtml(app.company)}</h4>
          <p>${escapeHtml(app.role || '')}</p>
        </div>
        <span class="status-pill status-${escapeAttr(statusKey)}">${escapeHtml(label)}</span>
      </div>
      <div class="progress-track" aria-label="${escapeAttr(stage.label)}">
        <span style="width: ${stage.percent}%"></span>
      </div>
      <div class="job-meta">
        <span>${escapeHtml(stage.label)}</span>
        <span>${escapeHtml(app.scoreRaw || '-')}</span>
      </div>
      <div class="job-note">${escapeHtml(nextPipelineAction(app))}</div>
      ${renderApplicationTimeline(app)}
    </article>
  `;
}

function renderApplicationTimeline(app) {
  const events = (app.events || []).slice(-4).reverse();
  if (!events.length) return '';
  return `
    <div class="application-event-list">
      ${events.map((item) => `
        <div class="application-event-row">
          <div>
            <strong>${escapeHtml(importEventLabel(item.event))}</strong>
            <span>${escapeHtml([item.date, item.due ? `截止 ${item.due}` : '', importSourceLabel(item.source)].filter(Boolean).join(' · '))}</span>
            ${item.next_action ? `<p>${escapeHtml(item.next_action)}</p>` : ''}
          </div>
          <div class="application-event-actions">
            <button class="icon-text-button" type="button" data-edit-application-event="${escapeAttr(item.event_id)}">编辑</button>
            <button class="icon-text-button danger-button" type="button" data-delete-application-event="${escapeAttr(item.event_id)}">删除</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTodoItem(item) {
  return `
    <article class="todo-item todo-${escapeAttr(item.kind)}">
      <div>
        <strong>${escapeHtml(item.company)}</strong>
        <span>${escapeHtml(item.role)}</span>
      </div>
      <p>${escapeHtml(item.action)}</p>
      <small>${escapeHtml([item.reason, item.due].filter(Boolean).join(' · '))}</small>
    </article>
  `;
}

function renderFeedbackCard(item) {
  return `
    <article class="feedback-review-card feedback-${escapeAttr(item.kind)}">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.summary)}</p>
      <strong>${escapeHtml(item.action)}</strong>
      ${item.evidence?.length ? `<ul>${item.evidence.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : ''}
    </article>
  `;
}

async function editApplicationEvent(eventId) {
  const item = findApplicationEvent(eventId);
  if (!item) return;
  const company = window.prompt('公司', item.company || '') ?? item.company;
  const role = window.prompt('岗位', item.role || '') ?? item.role;
  const event = window.prompt('事件类型 applied/application_received/responded/assessment/interview/offer/rejected/note', item.event || 'note') ?? item.event;
  const due = window.prompt('截止日期 YYYY-MM-DD，可留空', item.due || '') ?? item.due;
  const nextAction = window.prompt('下一步动作', item.next_action || '') ?? item.next_action;
  const note = window.prompt('备注/证据', item.note || item.evidence || '') ?? item.note;
  try {
    await VisualizerApi.updateApplicationEvent({
      event_id: item.event_id,
      company,
      role,
      event,
      due,
      next_action: nextAction,
      note,
      evidence: item.evidence || note,
      source: item.source || 'manual_import',
    });
    setStatus('事件已更新');
    await loadApplications();
  } catch (err) {
    setStatus(`更新失败：${err.message || err}`);
  }
}

async function deleteApplicationEvent(eventId) {
  const item = findApplicationEvent(eventId);
  if (!item) return;
  if (!window.confirm(`删除这条进度？\\n${importEventLabel(item.event)} · ${item.company || ''}`)) return;
  try {
    await VisualizerApi.deleteApplicationEvent({ event_id: eventId });
    setStatus('事件已删除');
    await loadApplications();
  } catch (err) {
    setStatus(`删除失败：${err.message || err}`);
  }
}

function findApplicationEvent(eventId) {
  for (const app of currentApplicationsData || []) {
    const found = (app.events || []).find((item) => item.event_id === eventId);
    if (found) return found;
  }
  return null;
}

function applicationStage(statusKey) {
  const stages = {
    evaluated: ['仅评估，未入管线', 8],
    applied: ['已投递，等回复', 38],
    responded: ['已回复，推进沟通', 58],
    interview: ['面试中', 78],
    offer: ['Offer 阶段', 100],
    rejected: ['已结束', 100],
    discarded: ['已放弃', 100],
    skip: ['不投', 100],
  };
  const [label, percent] = stages[statusKey] || ['待更新', 12];
  return { label, percent };
}

function applicationStageIndex(statusKey) {
  const order = { evaluated: 1, applied: 2, responded: 3, interview: 4, offer: 5, rejected: 6 };
  return order[statusKey] || 0;
}

function progressStatusLabel(app) {
  if (app.latestEvent?.event) return importEventLabel(app.latestEvent.event);
  return statusLabel(progressStatusKey(app));
}

function nextPipelineAction(app) {
  if (app.latestEvent?.next_action || app.latestEvent?.due || app.latestEvent?.note) {
    return [
      app.latestEvent.due ? `${app.latestEvent.due} 截止` : '',
      app.latestEvent.next_action || '',
      app.latestEvent.note || '',
    ].filter(Boolean).join(' · ');
  }
  const statusKey = progressStatusKey(app);
  if (statusKey === 'evaluated') return '还没有手工导入进展，不显示在投递管线。';
  if (statusKey === 'applied') return '记录投递日期；3-5 个工作日无回复再跟进。';
  if (statusKey === 'responded') return '把招聘方问题整理到回复助手，发送前本人确认。';
  if (statusKey === 'interview') return '进入面试准备，补齐项目证据和 STAR+R 故事。';
  if (statusKey === 'offer') return '对照薪资、职责、团队和成长空间做 offer 评估。';
  return app.notes || '保持记录完整，避免重复投递。';
}

function renderApplicationInsights(applications, metrics, responseRate, manualMetrics = {}) {
  const guidance = [
    applications.length ? '这里仅统计已确认的投递、邮箱回复、测评、面试和拒信。' : '当前还没有真实投递进度，先粘贴邮箱回执或面试邀请导入。',
    manualMetrics.manualApplied && responseRate < 30 ? '真实投递的回复率偏低，下一轮要加强首句匹配证据和薪资/到岗时间确认。' : '回复率数据不足时，先保证每次沟通都有 JD、薪资、地点和流程记录。',
    '岗位机会雷达只负责市场搜索、JD 收集、方向聚类和简历优化线索，不进入这里的投递数据库。',
  ];

  return `
    <div class="panel-heading compact-heading">
      <div>
        <p class="eyebrow">复盘辅助</p>
        <h3>投递反馈指导</h3>
      </div>
      <span>${escapeHtml(applications.length)} 条</span>
    </div>
    <div class="insight-stats">
      <div><strong>${escapeHtml(manualMetrics.manualApplied || 0)}</strong><span>真实投递</span></div>
      <div><strong>${escapeHtml(manualMetrics.manualResponded || 0)}</strong><span>真实回复</span></div>
      <div><strong>${escapeHtml(responseRate)}%</strong><span>回复率</span></div>
      <div><strong>${escapeHtml(manualMetrics.manualInterview || 0)}</strong><span>面试推进</span></div>
    </div>
    <div class="feedback-guide">
      <h4>下一轮动作</h4>
      <ul>${guidance.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <div class="feedback-guide">
      <h4>反馈记录口径</h4>
      <ul>
        <li>只根据手工粘贴的邮箱原文记录投递进展，包括投递回执、面试邀请、测评通知或拒信。</li>
        <li>已评估岗位只是候选池，不代表已经投递或待联系。</li>
        <li>拒绝、放弃和低匹配岗位及时关闭，避免污染真实管线。</li>
      </ul>
    </div>
  `;
}

function metricCard(label, value, hint) {
  return `
    <div class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </div>
  `;
}

function statusLabel(status) {
  const labels = {
    evaluated: '已评估',
    applied: '已投递',
    responded: '已回复',
    interview: '面试',
    offer: 'Offer',
    rejected: '被拒',
    discarded: '放弃',
    skip: '不投',
  };
  return labels[status] || status || '未知';
}

function renderJobCard(app, compact) {
  return `
    <article class="job-card">
      <div class="job-card-head">
        <span class="tracker-id">#${escapeHtml(app.id)}</span>
        <span class="status-pill status-${escapeAttr(app.statusKey)}">${statusLabel(app.statusKey)}</span>
      </div>
      <h4>${escapeHtml(app.company)}</h4>
      <p>${escapeHtml(app.role)}</p>
      <div class="job-meta">
        <span>${escapeHtml(app.scoreRaw || '-')}</span>
        <span>${escapeHtml(app.date || '-')}</span>
      </div>
      ${compact ? '' : `<div class="job-note">${escapeHtml(app.notes || '')}</div>`}
    </article>
  `;
}

function renderJobsTable(applications) {
  if (!applications.length) {
    return '<div class="empty-state">暂无岗位记录。</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>编号</th>
          <th>公司</th>
          <th>岗位</th>
          <th>评分</th>
          <th>状态</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        ${applications.map((app) => `
          <tr>
            <td>#${escapeHtml(app.id)}</td>
            <td>${escapeHtml(app.company)}</td>
            <td>${escapeHtml(app.role)}</td>
            <td>${escapeHtml(app.scoreRaw || '-')}</td>
            <td><span class="status-pill status-${escapeAttr(app.statusKey)}">${statusLabel(app.statusKey)}</span></td>
            <td>${escapeHtml(app.notes || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

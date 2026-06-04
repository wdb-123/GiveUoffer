async function loadReplyDrafts() {
  if (!replyPlatformBoard || !replyChatList) return;
  if (currentView === 'reply') setStatus('读取回复草稿');
  const [data, marketData] = await Promise.all([
    VisualizerApi.listReplyDrafts(),
    VisualizerApi.listRecruitmentMarket().catch(() => ({ jobs: [] })),
  ]);
  currentReplyData = data || { drafts: [] };
  currentMarketData = marketData || { jobs: [] };
  renderReplyDrafts(currentReplyData, currentMarketData);
  if (currentView === 'reply') setStatus('已更新');
}

async function createReplyDraft() {
  if (!replyGenerateBtn) return;
  replyGenerateBtn.disabled = true;
  if (replyStatus) replyStatus.textContent = '正在生成回复草稿...';
  setStatus('生成回复');
  const payload = {
    source: document.querySelector('#replySource')?.value || 'Boss 直聘',
    company: document.querySelector('#replyCompany')?.value || '',
    role: document.querySelector('#replyRole')?.value || '',
    intent: document.querySelector('#replyIntent')?.value || 'interested',
    tone: document.querySelector('#replyTone')?.value || 'professional',
    salary: document.querySelector('#replySalary')?.value || '35K-45K',
    recruiterMessage: document.querySelector('#replyMessage')?.value || '',
    nextStep: document.querySelector('#replyNextStep')?.value || '',
  };

  try {
    const result = await VisualizerApi.createReplyDraft(payload);
    currentReplyData = result.replyDrafts;
    renderReplyDrafts(currentReplyData, currentMarketData);
    if (replyStatus) replyStatus.textContent = `已生成 ${result.draft?.id || ''}，发送前需要本人确认。`;
    setStatus('草稿已生成');
  } catch (err) {
    if (replyStatus) replyStatus.textContent = `生成失败：${err.message || err}`;
    setStatus('生成失败');
  } finally {
    replyGenerateBtn.disabled = false;
  }
}

function renderReplyDrafts(data, marketData = currentMarketData) {
  const drafts = data.drafts || [];
  const draftCount = drafts.filter((item) => item.status === 'draft').length;
  const copied = drafts.filter((item) => item.status === 'copied').length;
  const chats = buildRecruitmentChats(marketData.jobs || [], drafts);
  if (!selectedChatId || !chats.some((chat) => chat.id === selectedChatId)) {
    selectedChatId = chats[0]?.id || '';
  }
  const selected = chats.find((chat) => chat.id === selectedChatId) || chats[0];
  const platformCount = new Set(chats.map((chat) => chat.platform)).size;

  if (replyMetrics) {
    replyMetrics.innerHTML = '';
  }

  replyPlatformBoard.innerHTML = selected ? renderMainChatPanel(selected) : '<div class="empty-state">还没有可展示的招聘沟通会话。</div>';
  replyChatList.innerHTML = chats.length
    ? chats.map((chat) => renderChatListItem(chat, chat.id === selected?.id)).join('')
    : '<div class="empty-state">暂无聊天会话。</div>';

  replyChatList.querySelectorAll('[data-select-chat]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedChatId = button.dataset.selectChat;
      renderReplyDrafts(currentReplyData, currentMarketData);
    });
  });
  replyPlatformBoard.querySelectorAll('[data-prefill-reply]').forEach((button) => {
    button.addEventListener('click', () => prefillReplyComposer(button.dataset.prefillReply));
  });

  if (replyDraftsEl) {
    replyDraftsEl.innerHTML = drafts.length ? drafts.map(renderReplyDraftCard).join('') : '';
    replyDraftsEl.querySelectorAll('[data-copy-draft]').forEach((button) => {
      button.addEventListener('click', () => copyReplyDraft(button.dataset.copyDraft));
    });
    replyDraftsEl.querySelectorAll('[data-status-draft]').forEach((button) => {
      button.addEventListener('click', () => updateReplyStatus(button.dataset.statusDraft, button.dataset.status));
    });
  }
}

function normalizeReplyPlatform(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('boss') || text.includes('直聘')) return 'Boss 直聘';
  if (text.includes('脉脉') || text.includes('maimai')) return '脉脉';
  if (text.includes('猎聘') || text.includes('liepin')) return '猎聘';
  if (text.includes('智联') || text.includes('zhaopin')) return '智联招聘';
  if (text.includes('官网') || text.includes('腾讯') || text.includes('company')) return '公司官网';
  if (text.includes('mail') || text.includes('邮箱')) return '邮箱';
  if (text.includes('聚合') || text.includes('转载')) return '聚合转载';
  return value || '其他渠道';
}

function buildRecruitmentChats(jobs, drafts) {
  const jobChats = sortMarketJobs(jobs || [], 'score-desc').slice(0, 20).map((job) => {
    const platform = normalizeReplyPlatform(platformLabel(job));
    return {
      id: `job:${job.id || normalizeJobKey(job.company, job.role)}`,
      kind: 'job',
      platform,
      company: job.company || '未知公司',
      role: job.role || '待确认岗位',
      score: Number(job.matchScore || 0),
      salary: job.salary || '薪资待确认',
      direction: job.direction || '方向待确认',
      note: job.fitReason || job.evidenceGap || '需要打开平台确认 JD、薪资和流程。',
      url: job.url || '',
      status: '待沟通',
      sourceItem: job,
    };
  });

  const draftChats = (drafts || []).map((draft) => ({
    id: `draft:${draft.id}`,
    kind: 'draft',
    platform: normalizeReplyPlatform(draft.source),
    company: draft.company || '未知公司',
    role: draft.role || '待确认岗位',
    score: 0,
    salary: draft.salary || '薪资待确认',
    direction: replyIntentLabel(draft.intent),
    note: draft.recruiterMessage || draft.draft || '已生成回复草稿，发送前需要本人确认。',
    url: '',
    status: replyStatusLabel(draft.status),
    sourceItem: draft,
  }));

  return [...draftChats, ...jobChats].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'draft' ? -1 : 1;
    return b.score - a.score;
  });
}

function renderMainChatPanel(chat) {
  const payload = quickReplyPayload(chat, 'interested');
  return `
    <section class="chat-panel-card">
      <div class="main-chat-head">
        <div>
          <span class="platform-dot">${escapeHtml(chat.platform.slice(0, 1))}</span>
          <div>
            <p class="eyebrow">${escapeHtml(chat.platform)}</p>
            <h3>${escapeHtml(chat.company)}</h3>
            <small>${escapeHtml(chat.role)}</small>
          </div>
        </div>
        <span class="status-pill">${escapeHtml(chat.status)}</span>
      </div>
      <div class="main-chat-thread">
        <div class="chat-date-divider"><span>候选沟通上下文</span></div>
        <article class="chat-bubble recruiter">
          <div class="chat-bubble-title">
            <strong>招聘方线索</strong>
            <span>${chat.score ? chat.score.toFixed(1) : escapeHtml(chat.status)}</span>
          </div>
          <p>${escapeHtml(chat.role)}</p>
          <small>${escapeHtml(chat.salary)} · ${escapeHtml(chat.direction)}</small>
        </article>
        <article class="chat-bubble system">
          ${escapeHtml(chat.note)}
        </article>
        <div class="chat-date-divider"><span>待发送草稿</span></div>
        <article class="chat-bubble me">
          <div class="chat-bubble-title">
            <strong>建议回复</strong>
            <span>人工确认</span>
          </div>
          <p>先确认 JD、职责边界、薪资范围、工作地点和面试流程；不要直接承诺投递或发送材料。</p>
        </article>
      </div>
      <div class="main-chat-actions">
        <div class="quick-reply-row" aria-label="快捷回复">
          <button class="quick-reply-button" type="button" data-prefill-reply="${escapeAttr(quickReplyPayload(chat, 'interested'))}">要 JD</button>
          <button class="quick-reply-button" type="button" data-prefill-reply="${escapeAttr(quickReplyPayload(chat, 'salary'))}">问薪资</button>
          <button class="quick-reply-button" type="button" data-prefill-reply="${escapeAttr(quickReplyPayload(chat, 'interview'))}">约面试</button>
          <button class="quick-reply-button" type="button" data-prefill-reply="${escapeAttr(quickReplyPayload(chat, 'decline'))}">婉拒</button>
        </div>
        <div class="main-action-row">
          <button class="small-button primary-small-button" type="button" data-prefill-reply="${escapeAttr(payload)}">写回复</button>
          ${chat.url ? `<a class="small-button" href="${escapeAttr(chat.url)}" target="_blank" rel="noreferrer">打开平台</a>` : ''}
        </div>
      </div>
    </section>
  `;
}

function quickReplyPayload(chat, intent) {
  const salary = chat.salary && chat.salary !== '未披露' ? chat.salary : '35K-45K';
  const messages = {
    interested: `我在${chat.platform}看到 ${chat.company} 的 ${chat.role}，想确认完整 JD、薪资范围、团队职责和面试流程。`,
    salary: `您好，我想先确认 ${chat.role} 的薪资结构、月薪范围、薪数、奖金和试用期规则，再判断匹配度。`,
    interview: `您好，这个方向我有兴趣。如果方便的话，可以发一下 JD 和面试流程；我今天 19:00 后或明天上午可以沟通。`,
    decline: `感谢联系。这个岗位我需要先暂缓，目前更优先机器人系统工程、机器人软件 SDK、具身智能数据基建和 AI 工程化相关方向。`,
  };
  return encodeURIComponent(JSON.stringify({
    source: chat.platform,
    company: chat.company,
    role: chat.role,
    salary,
    intent,
    message: chat.kind === 'draft' && intent === 'interested' ? chat.note : messages[intent],
  }));
}

function renderChatListItem(chat, active) {
  return `
    <button class="chat-list-item ${active ? 'is-active' : ''}" type="button" data-select-chat="${escapeAttr(chat.id)}">
      <div class="chat-list-top">
        <strong>${escapeHtml(chat.company)} · ${escapeHtml(chat.role)}</strong>
        <span class="chat-score">${chat.score ? chat.score.toFixed(1) : '-'}</span>
      </div>
      <div class="chat-list-meta">
        <span class="chat-platform-badge">${escapeHtml(chat.platform)}</span>
        <span class="chat-status-text">${escapeHtml(chat.status)}</span>
      </div>
    </button>
  `;
}

function prefillReplyComposer(encoded) {
  const data = JSON.parse(decodeURIComponent(encoded || '%7B%7D'));
  if (document.querySelector('#replySource')) document.querySelector('#replySource').value = data.source || 'Boss 直聘';
  if (document.querySelector('#replyCompany')) document.querySelector('#replyCompany').value = data.company || '';
  if (document.querySelector('#replyRole')) document.querySelector('#replyRole').value = data.role || '';
  if (document.querySelector('#replySalary')) document.querySelector('#replySalary').value = data.salary || '35K-45K';
  if (document.querySelector('#replyMessage')) document.querySelector('#replyMessage').value = data.message || '';
  if (document.querySelector('#replyIntent')) document.querySelector('#replyIntent').value = data.intent || 'interested';
  if (document.querySelector('#replyTone')) document.querySelector('#replyTone').value = 'professional';
  if (replyStatus) replyStatus.textContent = `已填入 ${data.source || '平台'} 候选岗位，可补充招聘方原话后生成草稿。`;
  setStatus(`已选择 ${data.company || '候选岗位'}，发送前需要本人确认`);
  document.querySelector('.reply-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderReplyDraftCard(item) {
  const created = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
  return `
    <article class="reply-card status-${escapeAttr(item.status)}">
      <div class="reply-card-head">
        <span class="tracker-id">${escapeHtml(item.id)}</span>
        <span class="status-pill status-${escapeAttr(item.status)}">${replyStatusLabel(item.status)}</span>
      </div>
      <h4>${escapeHtml(item.company)} · ${escapeHtml(item.role)}</h4>
      <div class="reply-meta">
        <span>${escapeHtml(item.source)}</span>
        <span>${escapeHtml(replyIntentLabel(item.intent))}</span>
        <span>${escapeHtml(created)}</span>
      </div>
      ${item.recruiterMessage ? `<blockquote>${escapeHtml(item.recruiterMessage)}</blockquote>` : ''}
      <textarea readonly>${escapeHtml(item.draft || '')}</textarea>
      <div class="reply-card-actions">
        <button class="small-button primary-small-button" type="button" data-copy-draft="${escapeAttr(item.id)}">复制草稿</button>
        <button class="small-button" type="button" data-status-draft="${escapeAttr(item.id)}" data-status="sent-manual">标记手动已发</button>
        <button class="small-button" type="button" data-status-draft="${escapeAttr(item.id)}" data-status="archived">归档</button>
      </div>
      <small>${escapeHtml(item.safetyNote || '发送前需要本人确认。')}</small>
    </article>
  `;
}

async function copyReplyDraft(id) {
  const card = replyDraftsEl?.querySelector(`[data-copy-draft="${CSS.escape(id)}"]`)?.closest('.reply-card');
  const text = card?.querySelector('textarea')?.value || '';
  if (!text) return;
  await navigator.clipboard.writeText(text);
  await updateReplyStatus(id, 'copied');
  replyStatus.textContent = `已复制 ${id}，请到 Boss/脉脉/邮箱确认后发送。`;
}

async function updateReplyStatus(id, status) {
  const result = await VisualizerApi.updateReplyDraftStatus({ id, status });
  currentReplyData = result.replyDrafts;
  renderReplyDrafts(currentReplyData, currentMarketData);
}

function replyStatusLabel(status) {
  const labels = {
    draft: '待确认',
    copied: '已复制',
    'sent-manual': '手动已发',
    archived: '已归档',
  };
  return labels[status] || status || '草稿';
}

function replyIntentLabel(intent) {
  const labels = {
    interested: '表达兴趣',
    salary: '薪资期望',
    interview: '面试安排',
    resume: '简历材料',
    decline: '礼貌拒绝',
  };
  return labels[intent] || intent || '回复';
}

function renderAiButler() {
  renderAiConversations();
  renderAiMessages();
}

function currentAiConversation() {
  return aiConversations.find((item) => item.id === currentAiConversationId) || aiConversations[0];
}

function renderAiConversations() {
  if (!aiConversationList) return;
  aiConversationList.innerHTML = aiConversations.map((conversation) => `
    <button class="ai-conversation-item ${conversation.id === currentAiConversationId ? 'is-active' : ''}" type="button" data-conversation-id="${escapeAttr(conversation.id)}">
      <strong>${escapeHtml(conversation.title)}</strong>
      <span>${escapeHtml(conversation.updatedAt)}</span>
    </button>
  `).join('');
  aiConversationList.querySelectorAll('.ai-conversation-item').forEach((button) => {
    button.addEventListener('click', () => {
      currentAiConversationId = button.dataset.conversationId;
      renderAiButler();
    });
  });
}

function renderAiMessages() {
  if (!aiChatMessages) return;
  const conversation = currentAiConversation();
  aiChatMessages.innerHTML = conversation.messages.map((message) => `
    <article class="ai-message is-${escapeAttr(message.role)}">
      <strong>${message.role === 'user' ? '我' : '复盘中心'}</strong>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join('');
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

function createAiConversation() {
  const id = `chat-${Date.now()}`;
  aiConversations.unshift({
    id,
    title: '新的复盘',
    updatedAt: '刚刚',
    messages: [
      {
        role: 'assistant',
        text: '你可以把一次投递反馈、拒绝原因、无回复现象或面试问题发给我，我会帮你复盘原因，并生成下一轮调整动作。',
      },
    ],
  });
  currentAiConversationId = id;
  renderAiButler();
}

function sendAiMessage(value) {
  const text = String(value || '').trim();
  if (!text) return;
  const conversation = currentAiConversation();
  conversation.messages.push({ role: 'user', text });
  conversation.messages.push({ role: 'assistant', text: mockAiButlerReply(text) });
  conversation.updatedAt = '刚刚';
  renderAiButler();
}

function mockAiButlerReply(text) {
  if (/经历|材料|证据|缺/i.test(text)) {
    return '复盘结论会优先落到经历资产库：哪些项目证据不足、哪些结果数据缺失、哪些 bullet 需要改写。当前最值得补的是可量化结果，例如从站数量、控制周期、复现次数、故障率变化和交付结论。';
  }
  if (/岗位|机会|雷达|渠道/i.test(text)) {
    return '我会把岗位反馈转成下一轮投递策略：保留高匹配方向，降低低反馈渠道权重，把未触达渠道列为登录或调试任务。机器人系统、工业通信、现场应用方向应排在前面。';
  }
  if (/投递|反馈|拒绝|无回复|待办|进度|沟通|面试/i.test(text)) {
    return '我会按反馈学习来复盘：先判断是岗位不匹配、简历证据不足、渠道问题、薪资区间问题，还是表达问题；然后生成下一轮岗位、简历和投递动作。';
  }
  return '我会把这条信息作为一次复盘输入：提取反馈信号，判断问题类型，并沉淀成策略调整、简历修改或经历补充任务。当前是前端 mock，后续可以接真实 AI 接口。';
}

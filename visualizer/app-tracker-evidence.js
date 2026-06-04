async function loadEvidenceRequests() {
  if (currentView === 'evidence') setStatus('读取补充请求');
  const data = await VisualizerApi.getEvidenceRequests();
  renderEvidenceRequests(data);
  if (currentView === 'evidence') setStatus('已更新');
}

function renderEvidenceRequests(data) {
  if (!evidenceMetrics || !evidenceRequestsEl) return;
  const requests = data.requests || [];
  const open = requests.filter((item) => item.status === 'open');
  const high = open.filter((item) => item.priority === 'high');
  const medium = open.filter((item) => item.priority === 'medium');

  evidenceMetrics.innerHTML = [
    metricCard('待补充', open.length, `更新 ${data.updatedAt || '-'}`),
    metricCard('高优先级', high.length, '直接影响命中率'),
    metricCard('中优先级', medium.length, '增强可信度'),
    metricCard('方向覆盖', new Set(open.map((item) => item.direction)).size, '相关投递方向'),
  ].join('');

  evidenceRequestsEl.innerHTML = open.length
    ? open.map(renderEvidenceCard).join('')
    : '<div class="empty-state">当前没有待补充请求。</div>';
}

function renderEvidenceCard(item) {
  return `
    <article class="evidence-card priority-${escapeAttr(item.priority)}">
      <div class="evidence-card-head">
        <span class="tracker-id">${escapeHtml(item.id)}</span>
        <span class="priority-pill">${priorityLabel(item.priority)}</span>
      </div>
      <h4>${escapeHtml(item.direction)}</h4>
      <p class="gap">${escapeHtml(item.gap)}</p>
      <dl>
        <dt>市场信号</dt>
        <dd>${escapeHtml(item.marketSignal)}</dd>
        <dt>已有证据</dt>
        <dd>${escapeHtml(item.currentEvidence)}</dd>
        <dt>补充文件</dt>
        <dd><code>${escapeHtml(item.targetFile)}</code></dd>
      </dl>
      <div class="ask-box">
        <strong>需要你补充</strong>
        <ul>${(item.askHuman || []).map((ask) => `<li>${escapeHtml(ask)}</li>`).join('')}</ul>
      </div>
      <div class="resume-impact">${escapeHtml(item.resumeImpact)}</div>
    </article>
  `;
}

function priorityLabel(priority) {
  const labels = { high: '高优先级', medium: '中优先级', low: '低优先级' };
  return labels[priority] || priority || '未分级';
}


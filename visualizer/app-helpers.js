function setStatus(value) {
  statusEl.textContent = value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function editableAttrs(lineIndex, prefix) {
  return `class="render-editable" data-line-index="${lineIndex}" data-md-prefix="${escapeAttr(prefix)}"`;
}

function resumeAvatar() {
  return `
    <figure class="resume-avatar" aria-label="职业照">
      <img src="assets/headshot.png" alt="韦东波职业照">
    </figure>
  `;
}

function renderListItem(value, section, lineIndex) {
  if (section === '核心技能' && value.includes('：')) {
    const [label, ...rest] = value.split('：');
    return `<li class="skill-card render-editable" data-line-index="${lineIndex}" data-md-prefix="- "><strong>${inline(label)}：</strong><span>${inline(rest.join('：'))}</span></li>`;
  }
  return `<li class="render-editable" data-line-index="${lineIndex}" data-md-prefix="- ">${inline(value)}</li>`;
}

function sectionClass(title) {
  const map = {
    '个人摘要': 'section-summary',
    '核心技能': 'section-skills',
    '项目经历': 'section-projects',
    '工作经历': 'section-experience',
    '教育背景': 'section-education',
    '荣誉': 'section-honors',
    '其他优势': 'section-honors',
    '正在补强': 'section-gap',
  };
  return map[title] || 'section-default';
}

function renderMiniMarkdown(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let inList = false;
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inList = false;
  let headerDone = false;
  let currentSection = '';
  let sectionOpen = false;
  let skipStrategy = false;
  const strategy = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex];
    const line = raw.trim();
    if (skipStrategy && line.startsWith('## ')) {
      skipStrategy = false;
    }

    if (skipStrategy) {
      if (line && !line.startsWith('#')) strategy.push(line.replace(/^- /, ''));
      continue;
    }

    if (!line) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<header class="resume-header"><div class="resume-identity"><h1 ${editableAttrs(lineIndex, '# ')}>${inline(line.slice(2))}</h1>`);
      headerDone = true;
      continue;
    }

    if (headerDone && !line.startsWith('#') && !line.startsWith('- ') && out.at(-1)?.startsWith('<header')) {
      out.push(`<div class="contact" ${editableAttrs(lineIndex, 'plain')}>${inline(line)}</div></div>${resumeAvatar()}</header>`);
      continue;
    }

    if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      const sectionTitle = line.slice(3);
      if (sectionTitle === '投递定位') {
        skipStrategy = true;
        continue;
      }
      if (sectionOpen) out.push('</section>');
      currentSection = sectionTitle;
      sectionOpen = true;
      out.push(`<section class="resume-section ${sectionClass(sectionTitle)}"><h2 ${editableAttrs(lineIndex, '## ')}>${inline(sectionTitle)}</h2>`);
      continue;
    }

    if (line.startsWith('### ')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 ${editableAttrs(lineIndex, '### ')}>${inline(line.slice(4))}</h3>`);
      continue;
    }

    if (line === '---') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<hr>');
      continue;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        out.push(`<ul class="${currentSection === '核心技能' ? 'skill-card-grid' : ''}">`);
        inList = true;
      }
      out.push(renderListItem(line.slice(2), currentSection, lineIndex));
      continue;
    }

    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p ${editableAttrs(lineIndex, 'plain')}>${inline(line)}</p>`);
  }

  if (inList) out.push('</ul>');
  if (sectionOpen) out.push('</section>');
  strategyCluesEl.textContent = strategy.join(' ') || '这份简历没有单独的投递策略说明。';
  return out.join('\n');
}

function fileToBase64(file) {
  return new Promise((resolvePromise, rejectPromise) => {
    const reader = new FileReader();
    reader.onload = () => resolvePromise(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => rejectPromise(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function shellQuote(value) {
  return `"${String(value || '').replaceAll('\\', '\\\\').replaceAll('\"', '\\\"')}"`;
}

import type { ReactNode } from "react";

type AgentMarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string };

type JobImportResultCard = {
  id: string | undefined;
  company: string | undefined;
  role: string | undefined;
  city: string | undefined;
  salary: string | undefined;
  url: string | undefined;
  source: string | undefined;
  platform: string | undefined;
  direction: string | undefined;
  keywords: string[];
  tool: string | undefined;
  status: string | undefined;
  runId: string | undefined;
  stats: string | undefined;
  message: string | undefined;
};

type CanvasCardField = {
  label: string;
  values: string[];
};

type CanvasCard = {
  kind: string;
  title: string;
  fields: CanvasCardField[];
  tags: string[];
};

type CanvasDocument = {
  body: string;
  cards: CanvasCard[];
};

export function AgentMarkdown({
  text,
  onOpenFilePreview,
  streaming = false,
}: {
  text: string;
  onOpenFilePreview?: ((path: string) => void) | undefined;
  streaming?: boolean;
}) {
  const canvasDocument = parseCanvasDocument(text);
  if (canvasDocument.cards.length) {
    const blocks = parseAgentMarkdown(canvasDocument.body);
    return (
      <div className={streaming ? "agent-markdown is-streaming" : "agent-markdown"}>
        {renderMarkdownBlocks(blocks, onOpenFilePreview)}
        {canvasDocument.cards.map((card, index) => renderCanvasCard(card, index, onOpenFilePreview))}
        {streaming ? <span className="agent-stream-cursor" aria-hidden="true" /> : null}
      </div>
    );
  }

  const jobImportResult = parseJobImportResultCard(text);
  if (jobImportResult) {
    return (
      <div className={streaming ? "agent-markdown is-streaming" : "agent-markdown"}>
        {renderJobImportResultCard(jobImportResult)}
        {streaming ? <span className="agent-stream-cursor" aria-hidden="true" /> : null}
      </div>
    );
  }

  const blocks = parseAgentMarkdown(text);
  return (
    <div className={streaming ? "agent-markdown is-streaming" : "agent-markdown"}>
      {renderMarkdownBlocks(blocks, onOpenFilePreview)}
      {streaming ? <span className="agent-stream-cursor" aria-hidden="true" /> : null}
    </div>
  );
}

function renderMarkdownBlocks(
  blocks: AgentMarkdownBlock[],
  onOpenFilePreview?: ((path: string) => void) | undefined,
): ReactNode[] {
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const Heading = (`h${block.level}` as "h1" | "h2" | "h3");
      return <Heading key={index}>{renderInlineMarkdown(block.text, onOpenFilePreview)}</Heading>;
    }
    if (block.type === "list") {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, onOpenFilePreview)}</li>
          ))}
        </List>
      );
    }
    if (block.type === "quote") {
      return <blockquote key={index}>{renderInlineMarkdown(block.text, onOpenFilePreview)}</blockquote>;
    }
    if (block.type === "table") {
      return (
        <div className="agent-markdown-table-wrap" key={index}>
          <table>
            <thead>
              <tr>
                {block.headers.map((header, cellIndex) => (
                  <th key={`${cellIndex}-${header}`}>{renderInlineMarkdown(header, onOpenFilePreview)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {block.headers.map((_, cellIndex) => (
                    <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] || "", onOpenFilePreview)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (block.type === "code") {
      return <pre key={index}><code>{block.text}</code></pre>;
    }
    return <p key={index}>{renderInlineMarkdown(block.text, onOpenFilePreview)}</p>;
  });
}

function parseAgentMarkdown(markdown: string): AgentMarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: AgentMarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let codeLines: string[] | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    blocks.push({ type: "list", ordered: listOrdered, items: listItems });
    listItems = [];
    listOrdered = false;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] || "";
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      if (codeLines) {
        blocks.push({ type: "code", text: codeLines.join("\n") });
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/u);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: Math.min(headingMatch[1]?.length || 1, 3) as 1 | 2 | 3,
        text: headingMatch[2] || "",
      });
      continue;
    }

    if (isTableHeader(trimmed, lines[index + 1] || "")) {
      flushParagraph();
      flushList();
      const headers = parseTableRow(trimmed);
      index += 1;
      const rows: string[][] = [];
      while (index + 1 < lines.length && isTableDataRow(lines[index + 1] || "")) {
        index += 1;
        rows.push(parseTableRow(lines[index] || ""));
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/u);
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/u);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      if (listItems.length && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listItems.push((orderedMatch?.[1] || unorderedMatch?.[1] || "").trim());
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/u);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quoteMatch[1] || "" });
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n") });
  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", text: markdown }];
}

function parseCanvasDocument(markdown: string): CanvasDocument {
  const compactDocument = parseCompactCanvasDocument(markdown);
  if (compactDocument.cards.length) return compactDocument;

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const bodyLines: string[] = [];
  const cards: CanvasCard[] = [];
  let activeCard: { kind: string; lines: string[] } | null = null;

  for (const line of lines) {
    const cardMatch = line.trim().match(/^(?:[-*]\s*)?Canvas\s*卡片\s*[:：]\s*(.+)$/iu);
    if (cardMatch) {
      if (activeCard) cards.push(parseCanvasCard(activeCard.kind, activeCard.lines));
      activeCard = { kind: cleanMarkdownValue(cardMatch[1]) || "信息卡", lines: [] };
      continue;
    }
    if (activeCard) {
      activeCard.lines.push(line);
    } else {
      bodyLines.push(line);
    }
  }
  if (activeCard) cards.push(parseCanvasCard(activeCard.kind, activeCard.lines));
  return {
    body: bodyLines.join("\n").trim(),
    cards: cards.filter((card) => card.title || card.fields.length || card.tags.length),
  };
}

function parseCompactCanvasDocument(markdown: string): CanvasDocument {
  const match = markdown.match(/Canvas\s*卡片\s*[:：]/iu);
  if (!match || typeof match.index !== "number") return { body: markdown, cards: [] };

  const body = markdown.slice(0, match.index).trim();
  const cardText = markdown.slice(match.index + match[0].length).trim();
  if (!cardText) return { body: markdown, cards: [] };

  const resumeLabels = [
    "卡片类型",
    "标题",
    "总简历数",
    "已绑定岗位数",
    "未绑定岗位数",
    "已绑定明细",
    "标签",
    "最近生成时间",
    "执行详情",
    "下一步",
  ];
  const jobLabels = [
    "id",
    "公司",
    "岗位",
    "城市",
    "薪资",
    "平台",
    "方向",
    "关键词",
    "URL",
    "来源",
    "执行说明",
    "工具",
    "运行状态",
    "统计",
    "runId",
  ];
  const broadLabels = [...resumeLabels, ...jobLabels];
  const broadLabelPattern = broadLabels.map(escapeRegExp).join("|");
  const firstField = cardText.match(new RegExp(`(?:${broadLabelPattern})\\s*[:：]`, "u"));
  const kind = cleanMarkdownValue(firstField ? cardText.slice(0, firstField.index).trim() : cardText) || "信息卡";
  const fieldText = firstField ? cardText.slice(firstField.index) : "";
  const cardTypeValue = cleanMarkdownValue(fieldText.match(new RegExp(`卡片类型\\s*[:：]\\s*([\\s\\S]*?)(?=(?:${broadLabelPattern})\\s*[:：]|$)`, "u"))?.[1]);
  const normalizedKind = cardTypeValue || kind;
  const labels = normalizedKind.includes("简历") || kind.includes("简历")
    ? resumeLabels
    : broadLabels;
  const labelPattern = labels.map(escapeRegExp).join("|");
  const fields: CanvasCardField[] = [];

  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*[:：]\\s*([\\s\\S]*?)(?=(?:${labelPattern})\\s*[:：]|$)`, "u");
    const value = cleanMarkdownValue(fieldText.match(pattern)?.[1]);
    if (value) fields.push({ label, values: splitCompactFieldValues(label, value) });
  }

  if (!fields.length) return { body: markdown, cards: [] };
  return {
    body,
    cards: [{
      kind: normalizedKind,
      title: readCanvasField(fields, "标题") || normalizedKind,
      fields: fields.filter((field) => field.label !== "标题" && field.label !== "标签" && field.label !== "卡片类型"),
      tags: splitKeywordValue(readCanvasField(fields, "标签")),
    }],
  };
}

function splitCompactFieldValues(label: string, value: string): string[] {
  if (label === "已绑定明细") {
    return value
      .split(/(?=\d{2,}[-\w]+\.md\s*→)/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseCanvasCard(kind: string, lines: string[]): CanvasCard {
  const fields: CanvasCardField[] = [];
  let currentField: CanvasCardField | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const fieldMatch = trimmed.match(/^(?:[-*]\s*)?([^:：]+)\s*[:：]\s*(.*)$/u);
    if (fieldMatch) {
      const label = cleanMarkdownValue(fieldMatch[1]) || "";
      const value = cleanMarkdownValue(fieldMatch[2]) || "";
      if (/^Canvas\s*卡片$/iu.test(label)) continue;
      if (!label) continue;
      currentField = { label, values: value ? [value] : [] };
      fields.push(currentField);
      continue;
    }
    const nestedMatch = trimmed.match(/^[-*]\s+(.+)$/u);
    if (nestedMatch && currentField) {
      const value = cleanMarkdownValue(nestedMatch[1]);
      if (value) currentField.values.push(value);
      continue;
    }
    if (currentField) {
      const value = cleanMarkdownValue(trimmed);
      if (value) currentField.values.push(value);
    }
  }

  const normalizedKind = readCanvasField(fields, "卡片类型") || kind;
  const title = readCanvasField(fields, "标题") || normalizedKind;
  const tags = splitKeywordValue(readCanvasField(fields, "标签"));
  return {
    kind: normalizedKind,
    title,
    fields: fields.filter((field) => field.label !== "标题" && field.label !== "标签" && field.label !== "卡片类型"),
    tags,
  };
}

function readCanvasField(fields: CanvasCardField[], label: string): string | undefined {
  const value = fields.find((field) => field.label === label)?.values.join("；");
  return cleanCanvasDisplayValue(value);
}

function renderCanvasCard(
  card: CanvasCard,
  index: number,
  onOpenFilePreview?: ((path: string) => void) | undefined,
): ReactNode {
  if (card.kind.includes("简历")) {
    return renderResumeCanvasCard(card, index, onOpenFilePreview);
  }

  const metricFields = pickCanvasMetricFields(card.fields);
  const detailFields = card.fields.filter((field) => !metricFields.includes(field));
  const kindClass = card.kind.includes("投递") ? "is-application" : "";

  return (
    <section className={`agent-canvas-card ${kindClass}`} key={`canvas-card-${index}`}>
      <div className="agent-canvas-head">
        <div>
          <div className="agent-canvas-kicker">
            <span className="agent-canvas-dot" />
            {card.kind}
          </div>
          <h3>{card.title}</h3>
        </div>
      </div>

      {metricFields.length ? (
        <dl className="agent-canvas-metric-grid">
          {metricFields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{renderInlineMarkdown(field.values.join("；") || "待补充", onOpenFilePreview)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {detailFields.length ? (
        <div className="agent-canvas-field-list">
          {detailFields.map((field) => (
            <div className="agent-canvas-field" key={field.label}>
              <strong>{field.label}</strong>
              {field.values.length > 1 ? (
                <ul>
                  {field.values.map((value, valueIndex) => (
                    <li key={valueIndex}>{renderInlineMarkdown(value, onOpenFilePreview)}</li>
                  ))}
                </ul>
              ) : (
                <p>{renderInlineMarkdown(field.values[0] || "待补充", onOpenFilePreview)}</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {card.tags.length ? (
        <div className="agent-canvas-chip-row" aria-label="Canvas 标签">
          {card.tags.map((tag) => (
            <span className="agent-canvas-chip" key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function renderResumeCanvasCard(
  card: CanvasCard,
  index: number,
  onOpenFilePreview?: ((path: string) => void) | undefined,
): ReactNode {
  const total = readCanvasField(card.fields, "总简历数") || "待复核";
  const bound = readCanvasField(card.fields, "已绑定岗位数") || "待复核";
  const unbound = readCanvasField(card.fields, "未绑定岗位数") || "待复核";
  const bindings = card.fields.find((field) => field.label === "已绑定明细")?.values
    .map(cleanResumeBindingText)
    .map(cleanCanvasDisplayValue)
    .filter((value): value is string => Boolean(value && value !== "-"))
    .slice(0, 2) || [];
  const nextStep = readCanvasField(card.fields, "下一步");

  return (
    <section className="agent-resume-canvas-card" key={`resume-canvas-card-${index}`}>
      <div className="agent-resume-canvas-head">
        <div>
          <div className="agent-resume-canvas-kicker">
            <span className="agent-resume-canvas-dot" />
            简历资产
          </div>
          <h3>{card.title || "简历资产概览"}</h3>
        </div>
      </div>

      <dl className="agent-resume-stat-grid">
        <div>
          <dt>总简历</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>已绑定岗位</dt>
          <dd>{bound}</dd>
        </div>
        <div>
          <dt>未绑定岗位</dt>
          <dd>{unbound}</dd>
        </div>
      </dl>

      {bindings.length ? (
        <div className="agent-resume-binding-list">
          <strong>已绑定版本</strong>
          <ul>
            {bindings.map((binding, bindingIndex) => (
              <li key={bindingIndex}>{renderInlineMarkdown(binding, onOpenFilePreview)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {card.tags.length ? (
        <div className="agent-resume-chip-row" aria-label="简历标签">
          {card.tags.slice(0, 3).map((tag) => (
            <span className="agent-resume-chip" key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}

      {nextStep ? (
        <div className="agent-resume-next-step">
          {renderInlineMarkdown(nextStep, onOpenFilePreview)}
        </div>
      ) : null}
    </section>
  );
}

function cleanResumeBindingText(value: string): string {
  return value
    .replace(/\s*执行详情[\s\S]*$/u, "")
    .replace(/\s*下一步[\s\S]*$/u, "")
    .replace(/\s*标签[\s\S]*$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanCanvasDisplayValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/\s*[-–—]\s*$/u, "")
    .replace(/^\s*[-–—]\s*/u, "")
    .replace(/^要我我可以/u, "我可以")
    .replace(/^要我可以/u, "我可以")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned || undefined;
}

function pickCanvasMetricFields(fields: CanvasCardField[]): CanvasCardField[] {
  const metricLabels = ["总简历数", "已绑定岗位数", "未绑定岗位数", "评分", "薪资", "城市", "平台", "状态", "日期"];
  const directMatches = fields.filter((field) => metricLabels.includes(field.label) || /数$|率$|分$|时间$/u.test(field.label));
  return directMatches.slice(0, 4);
}

function parseJobImportResultCard(text: string): JobImportResultCard | null {
  if (!text.includes("jobsearch.import_current_job")) return null;
  if (!/(已写入岗位|已导入岗位|导入结果|id\s*[:：]\s*MJ-\d+)/u.test(text)) return null;

  const id = readLabeledValue(text, "id")?.match(/MJ-\d+/u)?.[0];
  const company = readLabeledValue(text, "公司");
  const role = readLabeledValue(text, "岗位");
  const city = readLabeledValue(text, "城市");
  const salary = readLabeledValue(text, "薪资");
  const url = readLabeledValue(text, "URL");
  const source = readLabeledValue(text, "来源");
  const platform = readLabeledValue(text, "平台");
  const direction = readLabeledValue(text, "方向");
  const tool = readLabeledValue(text, "工具");
  const status = readLabeledValue(text, "运行状态") || readLabeledValue(text, "结果");
  const runId = readLabeledValue(text, "runId");
  const stats = readLabeledValue(text, "统计");
  const message = readLabeledValue(text, "执行说明");
  const keywords = splitKeywordValue(readLabeledValue(text, "关键词"));

  if (!id && !company && !role) return null;
  return {
    id,
    company,
    role,
    city,
    salary,
    url,
    source,
    platform,
    direction,
    keywords,
    tool,
    status,
    runId,
    stats,
    message,
  };
}

function readLabeledValue(text: string, label: string): string | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`^[\\s>*-]*(?:\`?${escapedLabel}\`?)\\s*[:：]\\s*(.+)$`, "imu");
  const value = text.match(pattern)?.[1];
  return cleanMarkdownValue(value);
}

function cleanMarkdownValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/\*\*/gu, "")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned || undefined;
}

function splitKeywordValue(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[、,，/|]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function renderJobImportResultCard(card: JobImportResultCard): ReactNode {
  const statusText = card.status || "completed";
  const statusTone = /fail|失败|error|错误/u.test(statusText) ? "is-failed" : "is-success";
  const title = card.role || "岗位已导入";
  const company = card.company || "待补充公司";
  const metrics = [
    card.salary ? { label: "薪资", value: card.salary } : null,
    card.city ? { label: "城市", value: card.city } : null,
    card.platform ? { label: "平台", value: card.platform } : null,
    card.direction ? { label: "方向", value: card.direction } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="agent-job-result-card" key="job-import-result">
      <div className="agent-job-result-head">
        <div>
          <div className="agent-job-result-kicker">
            <span className={`agent-job-status-dot ${statusTone}`} />
            单条岗位导入
          </div>
          <h3>{title}</h3>
          <p>{company}</p>
        </div>
      </div>

      {metrics.length ? (
        <dl className="agent-job-meta-grid">
          {metrics.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {card.keywords.length ? (
        <div className="agent-job-chip-row" aria-label="岗位关键词">
          {card.keywords.map((keyword) => (
            <span className="agent-job-chip" key={keyword}>{keyword}</span>
          ))}
        </div>
      ) : null}

      {card.url || card.message ? (
        <div className="agent-job-card-footer">
          {card.url ? (
            <a className="agent-job-link" href={card.url} rel="noreferrer" target="_blank">
              打开岗位链接
            </a>
          ) : null}
          {card.message ? <span>{card.message}</span> : null}
        </div>
      ) : null}

      <details className="agent-job-result-details">
        <summary>执行详情</summary>
        <div>
          {card.tool ? <span>工具：{card.tool}</span> : null}
          <span>状态：{statusText}</span>
          {card.stats ? <span>统计：{card.stats}</span> : null}
          {card.source ? <span>来源：{card.source}</span> : null}
          {card.runId ? <span>runId：{card.runId}</span> : null}
        </div>
      </details>
    </section>
  );
}

function isTableHeader(line: string, nextLine: string): boolean {
  return line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(nextLine);
}

function isTableDataRow(line: string): boolean {
  return line.trim().includes("|") && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.replace(/\s+/g, " ").trim());
}

function renderInlineMarkdown(text: string, onOpenFilePreview?: ((path: string) => void) | undefined): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+|\*\*[^*]+\*\*|`[^`]+`|(?:\/Users\/[^\s)<]+|(?:workspace|reports|data|output|apps|packages|docs|config|scripts|batch|tools|interview-prep|jds)\/[^\s)<]+))/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    if (linkMatch) {
      const href = linkMatch[2] || "";
      const label = linkMatch[1] || href;
      if (isLocalFileRef(href)) {
        nodes.push(renderLocalFileButton(href, label, key, onOpenFilePreview));
      } else {
        nodes.push(renderSafeLink(href, label, key));
      }
    } else if (token.startsWith("http")) {
      const { href, suffix } = stripUrlSuffix(token);
      nodes.push(renderSafeLink(href, href, key));
      if (suffix) nodes.push(suffix);
    } else if (isLocalFileRef(token)) {
      nodes.push(renderLocalFileButton(token, token, key, onOpenFilePreview));
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(token);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderSafeLink(href: string, label: string, key: string) {
  if (!/^(https?:\/\/|mailto:)/u.test(href)) return label;
  return (
    <a href={href} key={key} rel="noreferrer" target="_blank">
      {label}
    </a>
  );
}

function renderLocalFileButton(
  path: string,
  label: string,
  key: string,
  onOpenFilePreview?: ((path: string) => void) | undefined,
) {
  if (!onOpenFilePreview) return label;
  return (
    <button
      type="button"
      className="agent-file-ref"
      key={key}
      onClick={() => onOpenFilePreview(path)}
      title={path}
    >
      {label}
    </button>
  );
}

function isLocalFileRef(value: string): boolean {
  const normalized = value.trim();
  return normalized.startsWith("/Users/")
    || /^(workspace|reports|data|output|apps|packages|docs|config|scripts|batch|tools|interview-prep|jds)\//u.test(normalized);
}

function stripUrlSuffix(value: string): { href: string; suffix: string } {
  const match = value.match(/^(.+?)([),.;:!?，。；：！？]*)$/u);
  return { href: match?.[1] || value, suffix: match?.[2] || "" };
}

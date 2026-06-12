import type { ReactNode } from "react";

type AgentMarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string };

export function AgentMarkdown({
  text,
  onOpenFilePreview,
  streaming = false,
}: {
  text: string;
  onOpenFilePreview?: ((path: string) => void) | undefined;
  streaming?: boolean;
}) {
  const blocks = parseAgentMarkdown(text);
  return (
    <div className={streaming ? "agent-markdown is-streaming" : "agent-markdown"}>
      {blocks.map((block, index) => {
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
      })}
      {streaming ? <span className="agent-stream-cursor" aria-hidden="true" /> : null}
    </div>
  );
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

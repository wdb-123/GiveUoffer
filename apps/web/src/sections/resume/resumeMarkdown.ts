export type TextResumeBlock = { type: "h1" | "h2" | "h3" | "p" | "contact"; text: string };
export type ResumeBlock = TextResumeBlock | { type: "ul"; items: string[] };

export function blockKey(block: ResumeBlock): string {
  return block.type === "ul" ? block.items.join("|") : block.text;
}

export function slugResumeSection(section: string): string {
  if (section.includes("个人摘要")) return "summary";
  if (section.includes("核心技能")) return "skills";
  if (section.includes("项目")) return "projects";
  if (section.includes("工作")) return "work";
  if (section.includes("教育")) return "education";
  if (section.includes("荣誉")) return "honors";
  return "default";
}

export function paginateMarkdown(markdown: string): ResumeBlock[][] {
  const blocks = parseResumeMarkdown(markdown);
  if (!blocks.length) return [];
  const pages: ResumeBlock[][] = [];
  let current: ResumeBlock[] = [];
  let weight = 0;
  const pageWeightLimit = 82;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    const nextWeight = blockWeight(block);
    const followingBlock = blocks[index + 1];
    const previousBlock = current[current.length - 1];
    const keepsHeadingWithBody = previousBlock?.type === "h2" && block.type === "ul";
    const wouldLeaveHeadingAtPageEnd =
      current.length > 0 &&
      (block.type === "h2" || block.type === "h3") &&
      followingBlock &&
      weight + nextWeight <= pageWeightLimit &&
      weight + nextWeight + blockWeight(followingBlock) > pageWeightLimit;
    if (wouldLeaveHeadingAtPageEnd) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    if (previousBlock?.type === "h3" && block.type === "ul" && weight + nextWeight > pageWeightLimit && current.length > 1) {
      current.pop();
      pages.push(current);
      current = [previousBlock];
      weight = blockWeight(previousBlock);
    }
    if (current.length && weight + nextWeight > pageWeightLimit && !keepsHeadingWithBody) {
      pages.push(current);
      current = [];
      weight = 0;
    }
    current.push(block);
    weight += nextWeight;
  }
  if (current.length) pages.push(current);
  return pages;
}

function parseResumeMarkdown(markdown: string): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  let list: string[] = [];
  let headerSeen = false;
  let contactCaptured = false;
  let skipStrategy = false;
  const flushList = () => {
    if (list.length) blocks.push({ type: "ul", items: list });
    list = [];
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (skipStrategy && line.startsWith("## ")) skipStrategy = false;
    if (skipStrategy) continue;
    if (!line) {
      flushList();
      continue;
    }
    if (headerSeen && !contactCaptured && !line.startsWith("#") && !line.startsWith("- ")) {
      flushList();
      blocks.push({ type: "contact", text: cleanInlineMarkdown(line) });
      contactCaptured = true;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)?.[1];
    if (bullet) {
      list.push(cleanInlineMarkdown(bullet));
      continue;
    }
    flushList();
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: cleanInlineMarkdown(line.slice(4)) });
    else if (line.startsWith("## ")) {
      const title = cleanInlineMarkdown(line.slice(3));
      if (title === "投递定位") {
        skipStrategy = true;
        continue;
      }
      blocks.push({ type: "h2", text: title });
    } else if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: cleanInlineMarkdown(line.slice(2)) });
      headerSeen = true;
    }
    else blocks.push({ type: "p", text: cleanInlineMarkdown(line) });
  }
  flushList();
  return blocks;
}

function blockWeight(block: ResumeBlock): number {
  if (block.type === "h1") return 5;
  if (block.type === "h2") return 3;
  if (block.type === "h3") return 2;
  if (block.type === "ul") return Math.max(2, block.items.length * 1.8);
  return Math.max(1, Math.ceil(block.text.length / 70));
}

function cleanInlineMarkdown(value: string): string {
  return value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

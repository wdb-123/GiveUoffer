import type { CareerProfileOverview, ExperienceMetadataItem, ExperienceOverview } from "@ucareer/shared";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

interface ExperienceSectionProps {
  experienceOverview: ExperienceOverview | null;
  profile: CareerProfileOverview | null;
  onUpdateExperience(
    id: string,
    patch?: Partial<Pick<ExperienceMetadataItem, "title" | "category" | "role" | "sourceFile" | "summary" | "tags" | "evidence" | "gaps" | "publicLevel">>
  ): void;
}

type ExperienceAsset =
  | { type: "profile"; id: "__profile__"; title: string; subtitle: string; profile: CareerProfileOverview | null }
  | { type: "overlay"; id: "__profile_overlay__"; title: string; subtitle: string; profile: CareerProfileOverview }
  | { type: "experience"; id: string; title: string; subtitle: string; item: ExperienceMetadataItem }
  | { type: "photo"; id: string; title: string; subtitle: string; item: ExperienceOverview["photos"][number] }
  | { type: "intention"; id: string; title: string; subtitle: string; item: ExperienceOverview["intentions"][number] };

export function ExperienceSection({ experienceOverview, profile }: ExperienceSectionProps) {
  const assets = useMemo(() => buildExperienceAssets(experienceOverview, profile), [experienceOverview, profile]);
  const [selectedId, setSelectedId] = useState("__profile__");
  const selectedAsset = assets.find((asset) => asset.id === selectedId) || assets[0] || {
    type: "profile",
    id: "__profile__",
    title: "职业画像总览",
    subtitle: "基于经历资产 / 职业偏好",
    profile,
  };
  const profileModel = useMemo(() => buildExperienceProfileModel(experienceOverview, profile), [experienceOverview, profile]);

  if (!experienceOverview && !profile) {
    return <div className="experience-empty-state">正在读取经历资产和个人画像。</div>;
  }
  const experiences = experienceOverview?.experiences || [];
  const photos = experienceOverview?.photos || [];
  const intentions = experienceOverview?.intentions || [];
  const profileAssets = assets.filter((asset) => asset.type === "profile" || asset.type === "overlay");

  return (
    <div className="experience-classic-workspace">
      <aside className="experience-asset-rail">
        <div className="experience-rail-head">
          <p className="section-eyebrow">Experience Assets</p>
          <h2>经历资产</h2>
          <span>{experienceOverview?.updatedAt ? `更新于 ${formatShortDate(experienceOverview.updatedAt)}` : profile ? "画像已加载" : "等待更新"}</span>
        </div>
        <details className="experience-asset-group" open>
          <summary>
            <h3>我的职业画像</h3>
            <span className="experience-asset-count">{profileAssets.length} 个</span>
            <span className="experience-asset-toggle" aria-hidden="true" />
          </summary>
          <div className="experience-file-list">
            {profileAssets.map((asset) => (
              <button
                className={selectedAsset?.id === asset.id ? "experience-file-item is-active" : "experience-file-item"}
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
              >
                <span className="experience-file-kind">{asset.type === "profile" ? "画像" : "偏好"}</span>
                <strong>{asset.title}</strong>
                <span className="experience-file-name">{asset.subtitle}</span>
              </button>
            ))}
          </div>
        </details>
        <details className="experience-asset-group">
          <summary>
            <h3>项目经历文件</h3>
            <span className="experience-asset-count">{experiences.length} 个</span>
            <span className="experience-asset-toggle" aria-hidden="true" />
          </summary>
          <div className="experience-file-list">
            {assets.filter((asset) => asset.type === "experience").map((asset) => (
              <button
                className={selectedAsset?.id === asset.id ? "experience-file-item is-active" : "experience-file-item"}
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
              >
                <span className="experience-file-kind">项目</span>
                <strong>{asset.title}</strong>
                <span className="experience-file-name">{asset.subtitle}</span>
              </button>
            ))}
          </div>
        </details>
        <details className="experience-asset-group">
          <summary>
            <h3>职业照资产</h3>
            <span className="experience-asset-count">{photos.length} 个</span>
            <span className="experience-asset-toggle" aria-hidden="true" />
          </summary>
          <div className="experience-file-list">
            {assets.filter((asset) => asset.type === "photo").length ? assets.filter((asset) => asset.type === "photo").map((asset) => (
              <button
                className={selectedAsset?.id === asset.id ? "experience-file-item is-active" : "experience-file-item"}
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
              >
                <span className="experience-file-kind">照片</span>
                <strong>{asset.title}</strong>
                <span className="experience-file-name">{asset.subtitle}</span>
              </button>
            )) : <div className="experience-asset-empty">还没有职业照。</div>}
          </div>
        </details>
        <details className="experience-asset-group">
          <summary>
            <h3>职业意向偏好资产</h3>
            <span className="experience-asset-count">{intentions.length} 个</span>
            <span className="experience-asset-toggle" aria-hidden="true" />
          </summary>
          <div className="experience-file-list">
            {assets.filter((asset) => asset.type === "intention").length ? assets.filter((asset) => asset.type === "intention").map((asset) => (
              <button
                className={selectedAsset?.id === asset.id ? "experience-file-item is-active" : "experience-file-item"}
                key={asset.id}
                type="button"
                onClick={() => setSelectedId(asset.id)}
              >
                <span className="experience-file-kind">偏好</span>
                <strong>{asset.title}</strong>
                <span className="experience-file-name">{asset.subtitle}</span>
              </button>
            )) : <div className="experience-asset-empty">还没有职业意向偏好。</div>}
          </div>
        </details>
      </aside>

      <main className="experience-document-shell-v2">
        <article className="experience-markdown-paper-v2">
          {selectedAsset?.type === "profile" ? <ExperienceProfileOverview model={profileModel} /> : null}
          {selectedAsset?.type === "overlay" ? <ProfileSourcePreview title={selectedAsset.title} subtitle="Profile Overlay" markdown={selectedAsset.profile.profileOverlayMarkdown} /> : null}
          {selectedAsset?.type === "experience" ? <ExperienceSourcePreview item={selectedAsset.item} /> : null}
          {selectedAsset?.type === "photo" ? <HeadshotPreview item={selectedAsset.item} /> : null}
          {selectedAsset?.type === "intention" ? <IntentionPreview item={selectedAsset.item} /> : null}
        </article>
      </main>

    </div>
  );
}

function ExperienceProfileOverview({ model }: { model: ReturnType<typeof buildExperienceProfileModel> }) {
  return (
    <section className="experience-profile-overview">
      <p className="eyebrow">职业画像</p>
      <h1>{model.headline}</h1>
      <p className="profile-summary">{model.summary}</p>
      <div className="profile-stat-grid">
        {model.stats.map((item) => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <ExperienceCard title="判断过程" items={model.reasoning} />
      <ExperienceCard title="核心画像" items={model.persona} />
      <ExperienceCard title="适合优先投递的岗位" items={model.fitRoles} />
      <ExperienceCard title="简历生成时应该突出" items={model.resumeFocus} />
      <ExperienceCard title="当前证据缺口" items={model.gaps} />
    </section>
  );
}

function ExperienceSourcePreview({ item }: { item: ExperienceMetadataItem }) {
  return (
    <section className="experience-source-preview-v2">
      <p className="eyebrow">{item.category || "项目经历"}</p>
      <h1>{item.title}</h1>
      <p className="experience-source-summary">{item.summary}</p>
      <div className="experience-tags">
        {item.tags.slice(0, 10).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <MarkdownDocument markdown={stripLeadingTitle(item.sourceContent || item.summary, item.title)} />
    </section>
  );
}

function HeadshotPreview({ item }: { item: ExperienceOverview["photos"][number] }) {
  return (
    <section className="headshot-preview">
      <p className="eyebrow">职业照资产</p>
      <h1>{item.title}</h1>
      <img src={item.dataUrl} alt={item.title} />
      <p>{item.path}</p>
    </section>
  );
}

function IntentionPreview({ item }: { item: ExperienceOverview["intentions"][number] }) {
  return (
    <section className="experience-source-preview-v2">
      <p className="eyebrow">职业意向偏好资产</p>
      <h1>{item.title}</h1>
      <MarkdownDocument markdown={stripLeadingTitle(item.content || `# ${item.title}`, item.title)} />
    </section>
  );
}

function ProfileSourcePreview({ title, subtitle, markdown }: { title: string; subtitle: string; markdown: string }) {
  return (
    <section className="experience-source-preview-v2">
      <p className="eyebrow">{subtitle}</p>
      <h1>{title}</h1>
      <MarkdownDocument markdown={stripLeadingTitle(markdown || `# ${title}\n待补充。`, title)} />
    </section>
  );
}

function ExperienceCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="experience-asset-card">
      <h4>{title}</h4>
      <ul>{items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>待补充。</li>}</ul>
    </section>
  );
}

function buildExperienceAssets(overview: ExperienceOverview | null, profile: CareerProfileOverview | null): ExperienceAsset[] {
  const profileAsset: ExperienceAsset = {
    type: "profile",
    id: "__profile__",
    title: "职业画像总览",
    subtitle: "基于经历资产 / 职业偏好",
    profile,
  };
  const profileSourceAssets: ExperienceAsset[] = profile ? [
    {
      type: "overlay",
      id: "__profile_overlay__",
      title: "求职画像与评分偏好",
      subtitle: "workspace/profile/_profile.md",
      profile,
    },
  ] : [];
  return [
    profileAsset,
    ...profileSourceAssets,
    ...(overview?.experiences || []).map((item) => ({
      type: "experience" as const,
      id: item.id,
      title: item.title,
      subtitle: item.sourceFile || item.category,
      item,
    })),
    ...(overview?.photos || []).map((item) => ({
      type: "photo" as const,
      id: `photo:${item.path}`,
      title: item.title,
      subtitle: item.path,
      item,
    })),
    ...(overview?.intentions || []).map((item) => ({
      type: "intention" as const,
      id: `intention:${item.path}`,
      title: item.title,
      subtitle: item.path,
      item,
    })),
  ];
}

function buildExperienceProfileModel(overview: ExperienceOverview | null, profile: CareerProfileOverview | null) {
  const experiences = overview?.experiences || [];
  const sourceText = [
    profile?.profileYaml || "",
    profile?.profileOverlayMarkdown || "",
    profile?.cvMarkdown || "",
    experiences.map((item) => `${item.title}\n${item.category}\n${item.summary}\n${item.tags.join(" ")}`).join("\n"),
  ].join("\n");
  const tags = uniqueList(experiences.flatMap((item) => item.tags));
  const profileSkills = inferSkillTerms(sourceText);
  const categories = uniqueList(experiences.map((item) => item.category).filter(Boolean));
  const evidence = uniqueList(experiences.flatMap((item) => item.evidence));
  const gaps = uniqueList(experiences.flatMap((item) => item.gaps));
  const profileGaps = profile ? readMarkdownBulletsAfter(profile.profileOverlayMarkdown, "Scoring Preferences")
    .filter((item) => /Caution|短板|不要|不是|纯|gap|缺口/i.test(item))
    .slice(0, 5) : [];
  const proofPoints = profile ? readYamlNamedItems(profile.profileYaml, "proof_points").slice(0, 6) : [];
  const superpowers = profile ? readYamlListAfter(profile.profileYaml, "superpowers").slice(0, 7) : [];
  const targetRoles = profile?.targetRoles?.length ? profile.targetRoles : [];
  const hasRobot = /机器人|ROS|EtherCAT|CAN|MoveIt|URDF|CiA402|SDK/i.test(sourceText);
  const hasAi = /RAG|Agent|AI|知识|检索|FastAPI|OpenAI/i.test(sourceText);
  const hasData = /数据|Pipeline|DataOps|DVC|MinIO|Label/i.test(sourceText);
  const mergedGaps = uniqueList([...gaps, ...profileGaps.map(cleanPreferenceLine)]);

  return {
    headline: profile?.headline || (hasRobot ? "机器人系统软件 / 工业通信 / AI 工程化复合型候选人" : "工程项目型候选人画像"),
    summary: readYamlScalar(profile?.profileYaml || "", "exit_story")
      || `系统读取了 ${experiences.length} 个结构化经历，并结合个人画像、项目标题、标签、证据项和缺口项，判断候选人的求职画像与简历生成策略。`,
    stats: [
      { value: `${targetRoles.length || profileSkills.length ? targetRoles.length : experiences.length}`, label: targetRoles.length ? "目标方向" : "项目经历" },
      { value: `${uniqueList([...tags, ...profileSkills]).length}`, label: "技能标签" },
      { value: `${evidence.length + proofPoints.length}`, label: "可用证据" },
      { value: `${mergedGaps.length}`, label: "待补证据" },
    ],
    reasoning: [
      targetRoles.length ? `根据个人画像判断目标方向：${targetRoles.join("、")}。` : `根据项目类别判断主线：${categories.slice(0, 6).join("、") || "待补充"}。`,
      `根据 CV、画像覆盖层和经历资产识别能力簇：${uniqueList([...profileSkills, ...tags]).slice(0, 10).join("、") || "待补充"}。`,
      `根据证据项判断可写入简历的强证据：${[...proofPoints.map((item) => item.name), ...evidence].slice(0, 5).join("；") || "待补充"}。`,
      "根据缺口项判断下一步补证据方向，避免把规划或待补材料写成已完成成果。",
    ],
    persona: superpowers.length ? superpowers : [
      hasRobot ? "主线能力集中在机器人软件、工业通信、关节模组 SDK、系统联调和客户问题闭环。" : "主线能力来自工程项目拆解、交付协同和技术沉淀。",
      hasAi ? "具备企业级 RAG / Agent / 知识治理经验，可把机器人产品知识转成 AI 工具链能力。" : "",
      hasData ? "对机器人数据闭环、日志/状态/动作数据治理和具身智能数据基建有延展方向。" : "",
      "更适合强调“现场问题复现 -> 技术定位 -> 文档/工具沉淀 -> 支撑交付”的工程闭环。",
    ].filter(Boolean),
    fitRoles: targetRoles.length ? targetRoles : [
      "机器人系统工程师 / 机器人软件工程师",
      "机器人 SDK / 工业通信 / 控制系统集成方向",
      hasAi ? "AI 工具链 / RAG 工程 / 机器人知识系统方向" : "",
      hasData ? "具身智能数据工程 / 机器人数据 Pipeline 方向" : "",
    ].filter(Boolean),
    resumeFocus: [
      ...proofPoints.map((item) => `${item.name}${item.metric ? `：${item.metric}` : ""}`),
      "优先突出 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、CiA402、SOEM / IGH 等硬技能。",
      "项目排序建议：SDK 生态与系统集成优先，其次 EtherCAT 稳定性测试，再补 RAG / Agent 工程化作为差异化。",
      "表达方式应偏“工程问题闭环”和“可复用交付资产”，少写空泛自我评价。",
    ].filter(Boolean).slice(0, 7),
    gaps: mergedGaps.length ? mergedGaps.slice(0, 6) : ["补充量化指标、项目截图、公开链接、客户反馈和最终结果。"],
  };
}

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; text: string };

function MarkdownDocument({ markdown }: { markdown: string }) {
  const blocks = parseMarkdownBlocks(markdown);
  if (!blocks.length) return <p>待补充。</p>;
  return (
    <div className="experience-rendered-markdown">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = (`h${block.level}` as "h1" | "h2" | "h3");
          return <Heading key={index}>{renderInlineMarkdown(block.text)}</Heading>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{renderInlineMarkdown(item)}</li>)}
            </List>
          );
        }
        if (block.type === "table") {
          return (
            <div className="experience-markdown-table-wrap" key={index}>
              <table>
                <thead>
                  <tr>{block.headers.map((header, cellIndex) => <th key={`${cellIndex}-${header}`}>{renderInlineMarkdown(header)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {block.headers.map((_, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] || "")}</td>)}
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
        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks: MarkdownBlock[] = [];
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
        text: cleanupMarkdownText(headingMatch[2] || ""),
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
      listItems.push(cleanupMarkdownText(orderedMatch?.[1] || unorderedMatch?.[1] || ""));
      continue;
    }

    flushList();
    paragraph.push(cleanupMarkdownText(trimmed));
  }

  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

function stripLeadingTitle(markdown: string, title: string): string {
  const normalizedTitle = normalizeMarkdownTitle(title);
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim() && !line.trim().startsWith("<!--"));
  if (firstContentIndex < 0) return markdown;
  const match = lines[firstContentIndex]?.trim().match(/^#\s+(.+)$/u);
  if (match && normalizeMarkdownTitle(match[1] || "") === normalizedTitle) {
    lines.splice(firstContentIndex, 1);
  }
  return lines.join("\n").trim();
}

function normalizeMarkdownTitle(value: string): string {
  return value.replace(/[#*_`-]/g, "").replace(/\s+/g, "").toLowerCase();
}

function isTableHeader(line: string, nextLine: string): boolean {
  return line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine);
}

function isTableDataRow(line: string): boolean {
  return line.trim().includes("|") && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanupMarkdownText(cell.trim()));
}

function cleanupMarkdownText(value: string): string {
  return value
    .replace(/^\|+|\|+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\)|https?:\/\/[^\s<]+|\*\*[^*]+\*\*|`[^`]+`)/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;
    const linkMatch = token.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)$/u);
    if (linkMatch) {
      nodes.push(<a href={linkMatch[2]} key={key} rel="noreferrer" target="_blank">{linkMatch[1]}</a>);
    } else if (token.startsWith("http")) {
      nodes.push(<a href={token} key={key} rel="noreferrer" target="_blank">{token}</a>);
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

function fitRolesForExperience(item: ExperienceMetadataItem): string[] {
  const text = `${item.category} ${item.title} ${item.tags.join(" ")}`;
  return [
    /机器人|ROS|EtherCAT|CAN|SDK|MoveIt|URDF/i.test(text) ? "机器人系统工程师 / 机器人软件工程师" : "",
    /SDK|CANopen|CiA402|SOEM|IGH/i.test(text) ? "机器人 SDK / 工业通信方向" : "",
    /RAG|Agent|AI|知识|FastAPI/i.test(text) ? "AI 工具链 / RAG 工程方向" : "",
    /数据|Pipeline|DataOps|DVC|MinIO|Label/i.test(text) ? "具身智能数据基建方向" : "",
  ].filter(Boolean);
}

function formatShortDate(value: string): string {
  return value.slice(0, 10);
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function readYamlScalar(yaml: string, key: string): string {
  const match = yaml.match(new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m"));
  return (match?.[1] || "").trim().replace(/^["']|["']$/g, "");
}

function readYamlListAfter(yaml: string, key: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s*${escapeRegExp(key)}:\\s*$`).test(line));
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.trim().startsWith("-")) break;
    const item = line.match(/^\s*-\s+(.+)$/)?.[1];
    if (item) items.push(item.trim().replace(/^["']|["']$/g, ""));
  }
  return items;
}

function readYamlNamedItems(yaml: string, key: string): Array<{ name: string; metric: string }> {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s*${escapeRegExp(key)}:\\s*$`).test(line));
  if (start < 0) return [];
  const items: Array<{ name: string; metric: string }> = [];
  let current: { name: string; metric: string } | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.trim().startsWith("-")) break;
    const name = line.match(/^\s*-\s+name:\s*["']?(.+?)["']?\s*$/)?.[1];
    if (name) {
      if (current) items.push(current);
      current = { name: name.trim(), metric: "" };
      continue;
    }
    const metric = line.match(/^\s*hero_metric:\s*["']?(.+?)["']?\s*$/)?.[1];
    if (metric && current) current.metric = metric.trim();
    const inline = line.match(/^\s*-\s+(.+)$/)?.[1];
    if (inline && !inline.startsWith("name:")) {
      const [inlineName, inlineMetric = ""] = inline.split(/\s*[:：]\s+/);
      items.push({ name: inlineName?.trim() || inline, metric: inlineMetric.trim() });
    }
  }
  if (current) items.push(current);
  return items;
}

function readMarkdownBulletsAfter(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.toLowerCase().includes(heading.toLowerCase()));
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s+/.test(line) && items.length) break;
    const item = line.match(/^\s*[-*]\s+(.+)$/)?.[1];
    if (item) items.push(item.trim());
  }
  return items;
}

function cleanPreferenceLine(value: string): string {
  return value.replace(/^\*\*(.*?)\*\*:\s*/, "$1：").replace(/\*\*/g, "").trim();
}

function inferSkillTerms(text: string): string[] {
  const terms = [
    "机器人", "ROS2", "ROS", "MoveIt", "URDF", "EtherCAT", "CANopen", "CAN", "CiA402",
    "SOEM", "IGH EtherCAT", "SDK", "RAG", "Agent", "FastAPI", "OpenAI", "Python",
    "C++", "Linux", "Git", "数据 Pipeline", "DVC", "MinIO", "Label Studio",
  ];
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

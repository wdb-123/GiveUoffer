# 开源简历 / 求职 Skills 调研

调研目标：找到可借鉴或可安装的开源 Agent Skills，用于优化韦东波的方向化简历库、JD 定制流程、ATS 友好输出和排版。

## 结论

最适合当前系统的不是直接替换 career-ops，而是吸收以下 4 类能力：

1. **事实可追溯**：每条简历 bullet 必须来自项目证据库，避免编造。
2. **方向母版 + JD 定制版**：保持我们当前 `resumes/*.md` 和 `resumes/targets/*.md` 架构。
3. **ATS / LaTeX / PDF 输出**：引入一页版、ATS 友好的输出模板思想。
4. **职位匹配与差距分析**：对每个 JD 输出匹配点、短板、可补 Demo、面试故事。

## 推荐优先级

### 1. varunr89/resume-tailoring-skill

**地址：** https://github.com/varunr89/resume-tailoring-skill

**定位：** 专门的 Claude Code 简历定制 skill。

**值得借鉴：**

- 针对 JD 生成高质量定制简历。
- 强调 factual integrity，不只是关键词堆砌。
- 有 multi-job batch processing、company research、experience discovery、confidence-scored content selection、gap identification。
- 支持 MD、DOCX、PDF 和 interview prep reports。

**适合我们怎么用：**

- 借鉴它的“confidence-scored content selection”思想。
- 给每个方向简历增加“证据置信度 / 可投递程度”检查。
- 在 JD 定制时输出 gap report。

**不建议直接替换：**

- 我们已经有 career-ops、方向母版、Boss 工作流和可视化前端。
- 可把它作为参考或安装到单独目录试用。

### 2. proficientlyjobs/proficiently-claude-skills

**地址：** https://github.com/proficientlyjobs/proficiently-claude-skills

**定位：** 完整求职工作流插件，包括 setup、job-search、tailor-resume、cover-letter、network-scan、apply。

**值得借鉴：**

- 每个 job application 一个文件夹。
- 保存 posting、resume、cover-letter、applied log。
- 有 ATS patterns，如 Greenhouse、Lever、Workday。
- 工作流完整，从搜索到改简历到申请。

**适合我们怎么用：**

- 借鉴它的 job folder 结构。
- 我们可以把 `resumes/targets/` 升级为：

```text
applications/{company}-{role}-{date}/
  posting.md
  analysis.md
  resume.md
  message.md
  status.md
```

**注意：**

- 它比我们当前需求更重，且包含浏览器申请自动化。
- 对 Boss 直聘这种需要登录和沟通的场景，不应自动点击投递或沟通。

### 3. resume-alignment

**地址：** https://www.aimcp.info/en/skills/f81eebbb-4ca8-4a67-885d-481c1f399311

**定位：** 把 JD 要求与 verified achievements / career lexicon 对齐。

**最值得借鉴：**

- 每条内容必须来自 career lexicon。
- 强调 authentic and traceable to source。
- 不编造信息。

**适合我们怎么用：**

- 把 `article-digest.md` 明确视为 career lexicon。
- 后续每份 target resume 都加一个隐藏或附属的 `evidence-map.md`：

```text
JD requirement -> resume bullet -> source in article-digest.md/cv.md -> confidence
```

### 4. openclaw one-page-cv

**地址：** https://openskillindex.com/skills/openclaw-skills-one-page-cv

**定位：** 生成一页 ATS-friendly LaTeX/PDF 简历。

**值得借鉴：**

- 一页版强约束。
- LaTeX / PDF。
- ATS 标签明确。
- 适合大厂和高筛选压力岗位。

**适合我们怎么用：**

- 为每个方向增加一个 `one-page` 输出模式。
- 不是所有信息都放进简历，而是强迫选择 2-3 个最贴 JD 的项目。

### 5. ndpvt-web/latex-document-skill

**地址：** https://github.com/ndpvt-web/latex-document-skill

**定位：** 通用 LaTeX 文档 skill，含 ATS 友好简历模板。

**值得借鉴：**

- 明确提到 ATS 友好：不用多列、不用表格布局、不用图形 header、机器可读文本。
- 有 `resume-technical.tex` 等现代模板。

**适合我们怎么用：**

- 改造当前可视化前端的打印样式。
- 增加一个 “ATS Plain” 模板，避免视觉过度设计。

### 6. claude-office-skills Resume Tailor

**地址：** https://github.com/claude-office-skills/skills

**定位：** 大量办公类 skills，其中 HR/Careers 包含 Resume Tailor、Cover Letter、Applicant Screening。

**值得借鉴：**

- 轻量。
- 可直接读 SKILL.md 内容作为写作规范参考。

**适合我们怎么用：**

- 借鉴其 resume tailor 的提示词风格。
- 不作为核心架构。

## 安全建议

第三方 skills 本质上是会影响 Agent 行为的本地指令，有些还带脚本。不要盲装。

安装前检查：

- `SKILL.md` 是否明确、短小、可读。
- 是否有 shell/python/js 脚本。
- 是否会读写敏感路径，如 `~/.ssh`、浏览器数据、邮箱、云盘。
- 是否会自动上传简历或 JD 到第三方服务。
- 是否有 MIT / Apache 等清晰 license。

## 对我们当前项目的最佳路线

不建议直接套用别人的系统。建议做一个本地 skill：

```text
career-resume-optimizer/
  SKILL.md
  references/
    evidence-map.md
    ats-rules.md
    direction-rules.md
  scripts/
    make-target-resume.mjs
    check-resume-evidence.mjs
```

这个 skill 应该固化我们的流程：

1. 读取 JD。
2. 选择方向母版。
3. 从 `article-digest.md` 找证据。
4. 生成 `resumes/targets/{company-role-date}.md`。
5. 生成 evidence map。
6. 检查是否有未经证实的 bullet。
7. 用 visualizer / PDF 输出。

## 推荐下一步

先不要安装第三方 skill。先把它们的最佳实践内化成我们自己的 skill：

- `resume-alignment` 的证据映射。
- `varunr89/resume-tailoring-skill` 的 gap analysis 和 confidence scoring。
- `one-page-cv` 的一页强约束。
- `latex-document-skill` 的 ATS Plain 模板规则。


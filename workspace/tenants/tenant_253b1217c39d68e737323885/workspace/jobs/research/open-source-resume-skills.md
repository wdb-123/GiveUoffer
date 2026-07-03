# 开源简历 / 求职 Skills 调研

调研目标：找到可借鉴或可安装的开源 Agent Skills，用于优化韦东波的方向化简历库、JD 定制流程、ATS 友好输出和排版。

## 结论

最适合当前系统的不是直接替换 Ucareer，而是吸收以下 4 类能力：

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

- 我们已经有 Ucareer、方向母版、Boss 工作流和可视化前端。
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

### 7. KunChen1110/InterviewRadar

**地址：** https://github.com/KunChen1110/InterviewRadar

**定位：** 面试雷达；基于牛客、小红书、GitHub、公开博客等真实面经，从简历和模糊岗位方向生成项目锚定的中文面试备考包。

**值得借鉴：**

- 面经来源不是静态题库，而是多源真实面经。
- 默认按近两年时效过滤，并用频次 × 时效排序高频问题。
- 把高频题挂到候选人简历里的具体项目，生成个性化追问链。
- 支持 Codex / Claude Code 读取 `SKILL.md` 后调用 `scripts/` 中的确定性脚本。
- 数据源包括牛客、GitHub 面经仓库、知乎 / CSDN / 公开博客；小红书可通过 MediaCrawler 接入。
- 输出中文 Markdown 备考包，强调可追溯来源，而不是让 LLM 凭空编题。

**适合我们怎么用：**

- 作为“岗位机会雷达”的面试情报补充层：高分岗位进入 `interview-prep` 前，先抓公司 / 岗位方向相关面经。
- 给每个目标岗位生成：

```text
interview-prep/{company}-{role}.md
  高频面试问题
  来源链接
  时效标记
  与我的项目锚定关系
  连环追问链
  简历证据缺口
```

- 可把它的 source connector 思路迁移到本项目：
  - `nowcoder`：牛客面经。
  - `xiaohongshu`：小红书面经，需单独登录 / MediaCrawler，注意平台规则。
  - `github`：公开面经仓库。
  - `web`：知乎、CSDN、博客正文页。
- 与 Ucareer 的 `interview-prep` 模式结合：先用岗位雷达找到岗位，再用 InterviewRadar 思路生成面试准备包。

**注意：**

- 小红书和招聘平台反爬严格，必须本地、用户授权、低频使用，不做批量抓取或商业化采集。
- 面经只能作为准备线索，不应伪装成公司官方流程。
- 如果直接安装第三方 skill，先审查 `SKILL.md`、`scripts/`、依赖和写入路径。

### 8. can4hou6joeng4/boss-agent-cli

**地址：** https://github.com/can4hou6joeng4/boss-agent-cli

**定位：** 面向 AI Agent 的 BOSS 直聘本地辅助 CLI；核心是只读职位搜索、福利筛选、详情查看、本地候选池、JSON 信封输出和 Agent / MCP / subprocess 集成。

**值得借鉴：**

- 默认低风险边界清晰：本地辅助、只读优先、用户主动触发、不规避风控、不批量触达、不抓取平台数据。
- `search` 支持城市、薪资、经验、学历、公司规模、行业、融资阶段、福利等筛选。
- `--welfare` 会做真实福利匹配，可减少“看起来合适但福利不符合”的岗位。
- `detail`、`show`、`shortlist` 能形成本地候选池闭环。
- stdout 统一 JSON 信封，适合被 Ucareer 脚本稳定解析。
- 平台抽象已覆盖 BOSS 直聘和智联招聘候选者侧，后续可继续接更多国内源。

**已接入本项目：**

新增脚本：

```bash
npm run radar:boss -- --query "机器人系统工程师" --query "ROS2 机器人" --city 深圳 --max 25
```

对应文件：

```text
scripts/research/boss-agent-radar.mjs
```

脚本行为：

- 调用 `boss status` 检查登录态。
- 调用 `boss search` 做只读搜索。
- 解析 JSON 输出并转换成 `data/recruitment-market.json` 的岗位结构。
- 去重后合并到岗位机会雷达。
- 生成 / 更新 `data/recruitment-market.md`。
- 记录 `lastBossAgentRadar` 元信息。

可选参数：

```bash
npm run radar:boss -- --city 深圳 --welfare "双休,五险一金" --salary 20-50K --experience "1-3年,3-5年" --details --max 30
```

**注意：**

- 需要先安装并登录：`uv tool install boss-agent-cli`，然后 `boss doctor`、`boss login`、`boss status`。
- 本项目接入脚本只使用 `status/search/detail`；不调用 `greet/apply/chat/exchange`。
- 投递、沟通、交换联系方式仍必须回到 Boss / 智联官网由用户手动完成。

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
7. 用新版 Web 控制台 / PDF 输出。

## 推荐下一步

先不要安装第三方 skill。先把它们的最佳实践内化成我们自己的 skill：

- `resume-alignment` 的证据映射。
- `varunr89/resume-tailoring-skill` 的 gap analysis 和 confidence scoring。
- `one-page-cv` 的一页强约束。
- `latex-document-skill` 的 ATS Plain 模板规则。

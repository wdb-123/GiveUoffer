# 前端可视化治理指引（Resume Visualizer）

## 目标

1. 前端不要出现单体脚本文件，按职责拆分为可维护的模块。
2. 共享状态集中，事件绑定与业务实现分离，便于定位回归问题。
3. 新增 DOM 交互时优先在对应域文件追加，不在公共文件随意拼接。

## 当前拆分完成情况（2026-06）

- `visualizer/app-state.js`：DOM 引用与全局状态。
- `visualizer/app-helpers.js`：通用渲染/转义/状态更新/上传工具。
- `visualizer/app-resume-core.js`：简历读取、模板、分页、方向线索。
- `visualizer/app-resume-editor.js`：简历渲染态编辑、自动保存、版本与导出。
- `visualizer/app-resume-resources.js`：工作空间资源浏览与保存、资源同步联动。
- `visualizer/app-experience-core.js`：经历资产列表、预览、诊断模型与基础元数据视图。
- `visualizer/app-experience-actions.js`：经历生成、导入、版本记录、保存行为。
- `visualizer/app-market.js`：岗位雷达检索、渲染、渠道矩阵与排序筛选。
- `visualizer/app-tracker-evidence.js`：证据补充请求与优先级卡片。
- `visualizer/app-tracker-applications.js`：投递导入、匹配投递记录、投递口径与指标。
- `visualizer/app-reply.js`：回复草稿列表、会话构建、快捷回复。
- `visualizer/app-ai.js`：复盘会话与 mock-AI 响应。
- `visualizer/app-events.js`：事件绑定、视图切换、应用启动入口（`init()`）。
- `visualizer/styles.css`：样式聚合入口（按职责拆分为子样式文件，保持原始顺序）  
  - `visualizer/styles/base.css`
  - `visualizer/styles/workspace.css`
  - `visualizer/styles/applications.css`
  - `visualizer/styles/insights.css`
  - `visualizer/styles/paper.css`
- `templates/portals.example.yml` + `portals.yml`：扫描配置已按 `tracked_companies_sources` 拆片
  - `templates/portals-fragments/portals-companies-*.yml`
- `recruitment-market-store.mjs`：岗位市场数据库读写已从 `recruitment-market.json` 拆出分片存储
  - 主文件 `data/recruitment-market.json` 保持元信息与运行状态
  - 作业明细落盘到 `data/recruitment-market.json.jobs.d/*.json`
  - 服务与脚本统一通过 `readRecruitmentMarket` / `writeRecruitmentMarket` 读写（`visualizer/services/recruitment-service.mjs`、`scripts/china-job-crawler.mjs`、`scripts/analyze-market-clusters.mjs`）

> `visualizer/index.html` 已按模块顺序加载上述文件，原 `app.js` 已拆分，当前不再承载主体业务逻辑。

## 数据治理要求（前端）

- 前端只通过后端 API 写入/读取数据，不直接 `localStorage` 缓存关键业务文件。
- 任何新增“用户配置型”字段先在后端 API 兼容并回填默认值，前端渲染时做空值兜底。
- 对批量写入动作（如版本/元数据/导入）统一在成功后 `load*` 重新拉取，不在页面内做脏状态推断。

## 回归清单（最小）

1. 加载 `/visualizer/`：切换“简历库 / 经历资产库 / 岗位雷达 / 投递进度 / 复盘中心 / 回复” 视图。
2. 简历链路：列出方向简历 → 预览分页 → 资源导入 → 行内编辑保存。
3. 经验链路：文件切换 → 元数据保存 → 版本回显。
4. 岗位链路：搜索/筛选/排序/官网入口显示。
5. 投递链路：邮件解析 → 生成命令 → 入库保存。
6. 回复链路：草稿生成 → 会话切换 → 复制发送。
7. 岗位市场链路：市场查询接口返回（含分片加载）→ 聚类脚本可成功生成报告。

如新增功能，请同步更新本文件并补齐 1~2 个 API 冒烟点 + 1 个前端交互冒烟点。

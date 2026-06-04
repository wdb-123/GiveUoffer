# Career-Ops 项目架构治理规范（v1.0）

> 目标：把系统能力与文件架构治理到“可维护、可拆分、可回溯、可持续演进”。
> 生效日期：2026-06-03

## 一、治理原则

1. 单一职责边界：每层只处理自己的问题，不能越界。
2. 可追溯性：关键行为必须可从命令/服务/日志链路反查到来源。
3. 增量改动优先：优先局部拆分，不允许一次性大规模重写。
4. 可测试闭环：任何数据读写、扫描、归档和状态变更都必须有回归验证。
5. 配置与用户数据隔离：系统默认值可自动更新，用户定制不被覆盖。
6. 数据最小冗余：重复字段允许短期兼容，但新逻辑优先使用单一事实源。

## 二、项目分层架构图

```mermaid
flowchart LR
  CLI[AI CLI 入口\n(agent 运行面)] --> Core[核心流程层\nsingle-eval / scan / batch]
  Core --> DataLayer[持久化层\ndata/ resumes/ mycv/ output/ reports/]
  Core --> Visualizer[可视化服务层\nvisualizer/]
  Core --> Dashboard[Go TUI 可视化\ndashboard/]
  Core --> Scripts[离线脚本\nscripts/, .mjs 工具]
  Visualizer --> APIGW[REST API]
  APIGW --> Services[服务层\napplication/evidence/workspace/recruitment/...]
  Scripts --> ParseTools[parser/network/parser-utils]
  DataLayer --> Tracker[tracker 校验\nmerge-tracker/verify/dedup/normalize]
```

## 三、职责边界与反向依赖约束

### 3.1 核心流程（根目录脚本）

- 职责：评估、扫描、聚类、生成报告、扫描健康检查。
- 规则：
  - 一个脚本只保留入口（解析参数、日志展示、调用）。
  - 复杂规则抽到 `scripts/*-lib/` 或 `scripts/*-*.mjs`。
  - 禁止脚本直接操作其他脚本私有副作用文件，必须通过共享模块。

### 3.2 Visualizer（Web 服务）

- `resume-visualizer.mjs`：路由组装与初始化。
- 各 `visualizer/services/*-service.mjs`：业务编排与文件读写调用。
- `visualizer/data-store.mjs`：所有通用文件读写。
- `visualizer/*-store|service|helpers`：前端交互逻辑按领域拆分。
- 规则：
  - 路由层不做持久化策略决策。
  - 大文件读写必须通过统一存储抽象（如 `readRecruitmentMarket`）。
  - `/api/*` 返回错误结构统一，避免“前端靠文本解析”。

### 3.3 Dashboard（Go）

- `dashboard/` 为独立 CLI/TUI，不得直接引入 visualizer 的 HTML 前端逻辑。
- `dashboard/internal/data/*` 仅消费共享数据文件，不改造输出协议。
- 规则：
  - 页面模型与输出渲染分离。
  - 大结构化列表采用分页或行内虚拟化。
  - 所有排序/过滤状态可复现（可序列化）。

### 3.4 数据层

- 用户定制源：`cv.md`、`config/profile.yml`、`modes/_profile.md`、`data/*`（用户产物）。
- 系统可自动更新源：`modes/_shared.md`、`templates/*`、`dashboard/*`、`scripts/*`。
- `data/` 下文件按“单一事实源 + 分片存储”治理。
- 规则：
  - 单文件存储若发生增长，应优先分片（如招聘市场）。
  - 写入必须保留向后兼容默认值（新增字段有 fallback）。
  - 读写路径需有白名单与权限控制。

## 四、数据治理（重点）

### 4.1 通用模型

- 统一命名：`{kind}-{timestamp|id}`，避免无语义文件名。
- 同步机制：
  - 批量/外部写入统一通过中间文件或 TSV，再由合并脚本收口。
- 状态机：
  - 使用 `templates/states.yml` 作为 `applications.md` 的唯一状态源。

### 4.2 数据库治理规则（文件即数据库）

1. `read` 与 `write` 必须由集中模块提供。
2. 不允许在业务脚本中手工拼接 JSON，必须经过结构化边界。
3. 引入 `jobs_file` 分片目录时：
   - 元文件仅保留索引与元信息。
   - 明细文件按固定分片编号写入。
4. 文件变更记录（至少）包含：
   - `updatedAt`
   - `last*` 执行上下文（来源/统计/参数）
5. 迁移策略：
   - 读路径兼容旧格式；写路径逐步迁移。
   - 迁移脚本应可幂等重复执行。

### 4.3 采集与扫描治理（门户/爬虫）

- 每次扫描必须保留：查询语句、命中数、重复过滤数、异常统计。
- 发现数据必须去重、可重放。
- 任何“直接爬取”需明确边界，不得绕过基础验证逻辑。

## 五、文件治理规则（最小可执行标准）

### 5.1 文件拆分门槛（建议）

- 新文件超过 500 行：进入“重构候选”。
- 超过 800 行：必须写“拆分提案 + 下一步迁移记录”。
- 超过 1000 行：立即提交拆分任务并附带验证清单。

### 5.2 单文件拆分策略

- 按领域切分优先级：
  1. 输入/参数解析
  2. 持久化服务层
  3. 计算/评分逻辑
  4. 输出渲染/导出
- 每个文件不超过一个核心抽象。
- 公共工具优先 `tools/`、`scripts/*-lib/`、`visualizer/services/*`。

### 5.3 样式治理

- CSS 采用分域拆分（base/workspace/application/insights/paper）。
- `styles.css` 仅做 `@import` 聚合。
- 禁止把新功能样式混入旧域文件；按模块建立专属样式文件。

## 六、接口与错误治理

### 6.1 API 合约

- 后端接口统一：
  - `400`：参数/输入校验失败
  - `404`：资源不存在
  - `500`：系统异常
- 返回体统一形态：
  - `ok`、`data`、`error` 三段式。
- API 改动要求同步更新前端调用点和冒烟清单。

### 6.2 工具链兼容性

- Node 运行入口必须支持 ESM。
- Shell/CLI 脚本保持输入参数可向后兼容。
- 外部依赖读取尽量降级处理（网络不可达时给出明确备注）。

## 七、提交与验收（治理执行）

### 7.1 每次治理改动必须记录

- 改动范围：影响文件列表。
- 风险点：兼容性与回滚点。
- 验证项：至少 3 项（见 7.2）。

### 7.2 最低验收清单

1. `node --check`（所有改动 `.mjs`）。
2. 关键脚本执行/干运行（`node analyze-...` / `node scan.mjs` / 自定义）。
3. 对应 API 冒烟（GET/POST 至少各一个）。
4. 用户链路冒烟（至少一个前端关键交互）。
5. 结构回归：无新增大文件直接承载同类职责。

### 7.3 变更审批规则

- 核心路由、数据 schema、状态机变更必须在对应治理文件中补充：
  - `docs/frontend-governance.md`
  - `docs/backend-frontend-governance.md`
  - `docs/ARCHITECTURE.md`
  - `docs/architecture-governance.md`
- 引入新脚本/新服务必须在 `docs/SCRIPTS.md` 里补充用途和输入输出。

## 八、治理指标与告警

- 线性指标：
  - 每月新增或修改后超过 500 行的文件数。
  - 数据分片目录数量、最大单文件行数。
  - 脚本执行失败率（`verify`/`test-all`）。
- 风险告警：
  - 状态字段出现别名或未归一化。
  - 出现“直接手改核心数据文件”操作痕迹。
  - 大文件回归（>1000 行）未拆分。

## 九、当前治理状态（快照）

- Frontend：样式与服务已按域拆分，`styles.css` 聚合化。
- 后端数据治理：招聘市场数据已抽象为 `recruitment-market-store.mjs` + 分片目录。
- Boss JD 导入能力：已沉淀为 `url + rawText` 导入流程，详见 `docs/boss-chrome-import.md`。不要依赖无登录态 fetch 解析 Boss 详情页。
- 前后端已统一读取新招聘市场访问入口。
- 当前高优先级待治理文件（>500 行）：
  - `analyze-patterns.mjs`
  - `scan.mjs`
  - `dashboard/internal/data/career.go`
  - `test-all.mjs`
  - `tracker-workflow.mjs`

## 十、治理执行方式（季度）

1. 开一次“架构检查轮次”：扫描大文件与高耦合文件。
2. 选 2~3 个高价值文件执行“实拆”。
3. 每次拆分提交后做 smoke 与回归验证。
4. 下轮治理按“最大收益”优先级：
   1. 脚本层（evaluate/scan）
   2. 服务分层（Go/TS）
   3. 文档与流程规则收口

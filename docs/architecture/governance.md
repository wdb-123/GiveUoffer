# Ucareer 项目架构治理规范（v1.0）

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
  CLI[AI CLI 入口\n(agent 运行面)] --> Core[核心流程层\nworkflow / scan / task]
  Core --> DataLayer[持久化层\nworkspace/ + .ucareer/]
  Core --> Web[React Web 控制台\napps/web]
  Core --> Daemon[本地 API 服务\napps/py-daemon]
  Core --> Scripts[离线脚本\nscripts/, .mjs 工具]
  Web --> Daemon
  Daemon --> Services[Python 服务层\nauth/billing/agent/workspace/connectors]
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

### 3.2 Web + Daemon（Web 服务）

- `apps/web`：React/Vite 前端控制台。
- `apps/py-daemon/src/ucareer_py_daemon/main.py`：FastAPI API 路由组合入口。
- `apps/py-daemon/src/ucareer_py_daemon/*`：Python 后端业务编排与文件/SQLite 读写调用。
- `docs/archive/legacy-typescript-daemon`：仅作为 legacy TypeScript 参考和 adapter boundary，不能作为新后端功能落点。
- 规则：
  - 路由层不做持久化策略决策。
  - 大文件读写必须通过 Python daemon store 抽象。
  - `/api/*` 返回错误结构统一，避免“前端靠文本解析”。

### 3.3 Web 控制台

- `apps/web` 是当前唯一用户界面入口。
- 规则：
  - 前端不拥有 workflow 路由决策，只消费 daemon 返回的 route preview / task / run 状态。
  - 大结构化列表采用分页或行内虚拟化。
  - 所有排序/过滤状态可复现（可序列化）。

### 3.4 数据层

- 用户定制源：`workspace/profile/*`、`workspace/resumes/*`、`workspace/jobs/*`、`workspace/ops/data/*`（用户产物）。
- 系统源：`modes/_shared.md`、`workspace/ops/templates/*`、`scripts/*`。
- `workspace/ops/data/` 下文件按“单一事实源 + 分片存储”治理。
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
  - 使用 `workspace/ops/templates/states.yml` 作为 `applications.md` 的唯一状态源。

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
- 公共工具优先 `tools/`、`scripts/*-lib/`、`apps/py-daemon/src/ucareer_py_daemon/*`。

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
2. 关键脚本执行/干运行（`npm run patterns -- ...` / `npm run scan` / 自定义）。
3. 对应 API 冒烟（GET/POST 至少各一个）。
4. 用户链路冒烟（至少一个前端关键交互）。
5. 结构回归：无新增大文件直接承载同类职责。

### 7.3 变更审批规则

- 核心路由、数据 schema、状态机变更必须在对应治理文件中补充：
  - `docs/architecture/overview.md`
  - `docs/architecture/governance.md`
  - `apps/web/src/ARCHITECTURE.md`
  - `apps/py-daemon/README.md`
- 引入新脚本/新服务必须在对应 README 或 `docs/guides/` 中补充用途和输入输出。

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
- 后端数据治理：默认本地 API 已迁移到 `apps/py-daemon`，招聘市场数据已抽象为 Python workspace store + 分片目录。
- Boss JD 导入能力：已沉淀为 `url + rawText` 导入流程，详见 `docs/guides/boss-chrome-import.md`。不要依赖无登录态 fetch 解析 Boss 详情页。
- 前后端已统一读取新招聘市场访问入口。
- 当前高优先级待治理文件（>500 行）：
  - `scripts/cli/analyze-patterns.mjs`
  - `scripts/cli/scan.mjs`
  - `scripts/cli/test-all.mjs`
  - `scripts/cli/tracker-workflow.mjs`

## 十、治理执行方式（季度）

1. 开一次“架构检查轮次”：扫描大文件与高耦合文件。
2. 选 2~3 个高价值文件执行“实拆”。
3. 每次拆分提交后做 smoke 与回归验证。
4. 下轮治理按“最大收益”优先级：
   1. 脚本层（evaluate/scan）
   2. Python daemon 服务分层
   3. 文档与流程规则收口

# Agent Skills CRUD Chain

This document records how Ucareer connects the frontend pages, backend skills, and local workspace CRUD tools.

## Runtime Flow

1. The frontend builds an invisible `AgentPageContext` from the current workspace page.
2. `useAgentData` sends that context with `CreateAgentTaskRequest.pageContext`.
3. The daemon router uses `pageContext.suggestedSkillId` before falling back to text classification.
4. The selected skill exposes only its allowed connector tools in the agent prompt.
5. The agent calls backend tools with:

```text
UC_TOOL_CALL {"tool":"<tool id>","input":{...}}
```

6. The daemon executes the tool, writes or reads the local workspace store, and injects `UC_TOOL_RESULT` into the next turn.

Frontend pages do not render extra agent UI for this chain. The context is data-only.

## Page Matrix

| Page | Suggested skill | Input kind | Main tools |
| --- | --- | --- | --- |
| 我的简历库 | `resume.generate` | `resume_request` | `resumes.list`, `resumes.get`, `resumes.save`, `resumes.delete` |
| 经历资产 | `experience.capture` | `project_note` | `experience.list`, `experience.upsert`, `experience.delete`, `evidence.list`, `evidence.upsert`, `evidence.fulfill`, `evidence.delete` |
| 岗位列表 | `job.evaluate` | `job_description` | `market.list`, `market.import`, `market.update`, `market.delete` |
| 投递进度 | `application.progress` | `application_update` | `applications.list`, `applications.create_event`, `applications.update_event`, `applications.delete_event`, `mailbox.search_messages` |
| 复盘中心 | `outcome.learn` | `outcome_feedback` | `applications.*`, `evidence.*`, `experience.*` |

## Data Boundaries

User-owned career data stays under `workspace/`.

Product code and templates stay outside `workspace/`. Page contexts and tools must not write personalization into system-layer files unless the relevant data contract explicitly allows it.

## External Job Page Intake

External pages are intentionally separate from the in-app page context chain:

- `extensions/chrome-job-importer/` reads the active Chrome tab and posts visible job text to the daemon.
- `POST /api/recruitment-market/manual-jobs` accepts pasted or extension-collected job text.
- `POST /api/recruitment-market/import` writes parsed jobs into the local market store.

This keeps authenticated website reading optional. The core CRUD path works without relying on a browser plugin.

## Boss 直聘 JD Detail Chain

Use the Codex Chrome Extension when the user has already logged in to Boss 直聘 in Chrome. This path is for authenticated page reading only. It must not click `立即沟通`, `投递`, `发送`, or any external application action.

In the Career Agent tool model, this path is represented as `jobsearch.search_jobs` with `source: "codex-chrome"`. The current local Codex CLI provider cannot execute it directly because its runtime does not expose Chrome MCP tools; use a Chrome-capable runtime before marking the source available.

### Goal

Import detailed JD records, not list summaries.

List text is allowed only for fast filtering, deduplication, and deciding which jobs deserve detail extraction. Final job-market writes must use the selected job's detail panel or detail page text.

### Default Batch

- Direction: 机器人方向.
- City: 深圳 unless the user specifies otherwise.
- Batch size: 10 detailed JDs.
- Expected runtime: 20-35 seconds for 10 JDs in normal conditions; 40-60 seconds if Boss or the Chrome CDP bridge stalls.

### Required Fields

Each imported job should include:

- `role`: 岗位名称.
- `company`: 公司名称.
- `salary`: 薪资.
- `location`: Base 城市 / 区域.
- `address`: 详细工作地址 when visible.
- `url`: 岗位网址 or current Boss search/detail URL when only the detail panel is available.
- `source`: `boss-zhipin`.
- `searchKeyword`: the keyword that found the job.
- `importedAt`: local ISO timestamp.
- `description`: JD 全文, including responsibilities, requirements, bonus points, and visible job content.

### Search Strategy

Run targeted keywords instead of one broad query. Good default keywords:

- `机器人系统工程师`
- `机器人软件工程师`
- `ROS2`
- `机器人SDK`
- `EtherCAT`
- `运动控制`
- `SLAM`
- `具身智能`
- `机器人解决方案`
- `人形机器人`

### Execution Steps

1. Claim the user's existing Boss Chrome tab through the Codex Chrome Extension.
2. Navigate the claimed tab to a targeted Boss search URL. Use the Boss form parameter order:

```text
https://www.zhipin.com/web/geek/jobs?city=101280600&query={encoded keyword}&industry=&position=
```

Putting `city` before `query` is more reliable than `query` first. The SEO-style `/c101280600/?query=...` path can redirect to the city homepage and should not be the primary route.
3. Read the current list page and collect candidate cards.
4. Filter out obvious non-target records such as internships, sales, low-value test assistant roles, pure training, and irrelevant outsourcing.
5. Open/select one candidate at a time.
6. Read the detail panel/page and extract the required fields. On Boss, clicking a result often keeps the URL on `/web/geek/jobs` and opens the JD in a same-page detail panel; do not require the browser URL to become `/job_detail/...`. Preserve the clicked candidate card's `/job_detail/...` href and use that as the imported job URL.
7. Call `market.import` or `POST /api/recruitment-market/manual-jobs` with the detailed JD text.
8. Let `job.evaluate` score and route the imported jobs.

### Tool Routing

The backend skill/tool sequence is:

1. Chrome read: Codex Chrome Extension reads authenticated Boss page text.
2. Import: `market.import` writes the JD into the recruitment market.
3. Evaluate: `job.evaluate` reads market jobs and writes reports/tracker artifacts.
4. Resume: `resume.generate` can use imported job IDs for targeted resume generation.
5. Applications: `application.progress` records subsequent application events.
6. Learning: `outcome.learn` updates profile/evidence after rejections, interviews, or feedback.

### Operational Notes

- Reuse the logged-in Boss tab when possible. New controlled tabs can show `加载中，请稍候` and are less reliable.
- If Codex Chrome returns `not part of browser session`, reacquire the browser runtime and claim a current user Boss tab again. Do not reuse stale tab handles.
- If the page body is only `加载中，请稍候`, wait/reload and retry candidate extraction. Never import that short text.
- Treat list results as incomplete. Import only after the detail panel contains `职位描述`, `岗位职责`, `工作职责`, `任职要求`, or `岗位要求`.
- Codex Chrome navigation is most reliable after claiming an already-open Boss tab. Navigating a non-Boss tab or an agent-created blank tab to Boss can no-op in the current extension runtime; ask the user to open Boss once, then claim that tab.
- Keep Chrome automation in a single execution when doing multi-step reads; plugin-controlled tab ownership can expire across separate REPL calls.
- If only list summaries are available, do not write final job records. Either open the detail panel or mark the result as incomplete.

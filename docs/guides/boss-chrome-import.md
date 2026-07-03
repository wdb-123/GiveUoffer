# Boss JD Import Capability

## Purpose

Boss 直聘详情页会对无登录态的后端 `fetch` 和无头浏览器返回安全页、登录页或 `请稍候` 页面。因此项目不能把 Boss 链接解析能力建立在普通 HTTP 抓取上。

## Supported Flow

1. 用户在已登录的 Chrome 中打开 Boss JD 详情页。
2. Codex Chrome 扩展读取当前可见页面正文。
3. 将 `url + rawText` 提交到 `POST /api/recruitment-market/manual-jobs`。
4. 后端从 JD 正文解析公司、岗位、地点、薪资、关键词和方向，并写入招聘市场数据。

## Stable Search Flow

Codex Chrome 可以做 Boss 搜索和信息获取，但当前稳定前提是：用户 Chrome 中已经有一个 Boss 标签页，Codex 通过 Chrome Extension claim 这个标签页后继续站内操作。

Career Agent 中对应的沉淀来源是 `jobsearch.search_jobs` 的 `source: "codex-chrome"`。当前本地 Codex CLI provider 没有 Chrome MCP 能力，因此该 source 会明确失败并提示运行时不支持；接入 Chrome-capable agent runtime 后按 `docs/guides/boss-codex-chrome-agent-source.md` 执行。

稳定搜索 URL：

```text
https://www.zhipin.com/web/geek/jobs?city=101280600&query={encoded keyword}&industry=&position=
```

注意事项：

- `city` 参数放在 `query` 前面；`query` 前置或 `/c101280600/?query=...` 容易回退到城市首页或旧结果。
- 搜索页只用于候选筛选，不直接入库。
- 点击候选后，Boss 常在同一搜索页打开右侧/下方详情面板，URL 仍然是 `/web/geek/jobs`，这是正常状态。
- 导入详情面板时，岗位 URL 必须使用被点击候选卡片的 `/job_detail/...` href，不要使用当前搜索页 URL。
- 只有详情正文包含 `职位描述`、`岗位职责`、`工作职责`、`任职要求` 或 `岗位要求` 时才允许导入。
- 如果页面只显示 `加载中，请稍候`，必须等待/刷新/重新 claim，不允许入库。
- Codex Chrome tab handle 可能过期并出现 `not part of browser session`，这时重新连接 Chrome 并 claim 当前 Boss 标签页。

## Fallback Flow

如果 Chrome 扩展不可用，用户可以在岗位列表页的手工导入表单中展开“较为落后的信息记录方式”，粘贴 JD 正文。系统同样会解析正文。

## Anti-Pattern

- 不要把 `请稍候`、登录页、验证码页、安全验证页当作岗位内容。
- 不要伪造 cookie 或尝试绕过验证码。
- 不要把平台名 `Boss直聘` 自动写入公司字段。

## Current Parser

入口：`apps/py-daemon/src/ucareer_py_daemon/workspace_stores.py` 的
`MarketStore`，通过 FastAPI 招聘市场 API 调用。

- URL-only：先尝试 fetch / browser 解析；被拦截时标记 `fetch-blocked` 或 `browser-blocked`。
- rawText：通过 `parseJobText(..., "text")` 解析可见 JD 正文。
- Boss visible text：优先抽取 `岗位 + 薪资 + 地点 + 公司基本信息`。
- Boss 字体混淆数字：后端会把 ``-`` 一类私有区数字还原为薪资数字，再解析 `30-60K`、`40-70K·14薪` 等薪资字段。

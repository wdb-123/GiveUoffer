# Boss JD Import Capability

## Purpose

Boss 直聘详情页会对无登录态的后端 `fetch` 和无头浏览器返回安全页、登录页或 `请稍候` 页面。因此项目不能把 Boss 链接解析能力建立在普通 HTTP 抓取上。

## Supported Flow

1. 用户在已登录的 Chrome 中打开 Boss JD 详情页。
2. Codex Chrome 扩展读取当前可见页面正文。
3. 将 `url + rawText` 提交到 `POST /api/recruitment-market/manual-jobs`。
4. 后端从 JD 正文解析公司、岗位、地点、薪资、关键词和方向，并写入招聘市场数据。

## Fallback Flow

如果 Chrome 扩展不可用，用户可以在岗位列表页的手工导入表单中展开“较为落后的信息记录方式”，粘贴 JD 正文。系统同样会解析正文。

## Anti-Pattern

- 不要把 `请稍候`、登录页、验证码页、安全验证页当作岗位内容。
- 不要伪造 cookie 或尝试绕过验证码。
- 不要把平台名 `Boss直聘` 自动写入公司字段。

## Current Parser

入口：`visualizer/services/recruitment-service.mjs`

- URL-only：先尝试 fetch / browser 解析；被拦截时标记 `fetch-blocked` 或 `browser-blocked`。
- rawText：通过 `parseJobText(..., "text")` 解析可见 JD 正文。
- Boss visible text：优先抽取 `岗位 + 薪资 + 地点 + 公司基本信息`。


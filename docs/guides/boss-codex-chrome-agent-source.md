# Boss Codex Chrome Agent Source

## Purpose

`codex-chrome` is the authenticated Boss search source for Career Agent. It is the productized form of the manually verified Codex Chrome workflow.

Use it only when the execution runtime can access the Codex Chrome Extension / Chrome MCP tools. The current local `codex` provider in Ucareer is `mcp: false`, so it cannot execute this source directly yet.

## Required Runtime

- User has Chrome open with an authenticated Boss session.
- A Boss tab is already open in Chrome.
- The agent runtime can list and claim Chrome tabs through Codex Chrome.
- The agent can call Ucareer `market.import` or `POST /api/recruitment-market/manual-jobs`.

## Stable Search URL

Use this exact parameter order:

```text
https://www.zhipin.com/web/geek/jobs?city=101280600&query={encoded keyword}&industry=&position=
```

Do not use `query` before `city` as the primary path. Do not use `/c101280600/?query=...` as the primary path.

## Execution Algorithm

1. List open Chrome tabs and claim the current Boss tab.
2. Navigate the claimed Boss tab to the stable search URL.
3. Wait until the page is not `加载中，请稍候`.
4. Extract visible `a[href*='job_detail']` candidate cards with:
   - candidate href
   - card text
   - role text
   - screen rect
5. Filter out irrelevant cards.
6. Click a candidate card.
7. Read the same-page detail panel. Boss may keep the browser URL at `/web/geek/jobs`; this is normal.
8. Accept the detail only if the detail text contains `职位描述`, `岗位职责`, `工作职责`, `任职要求`, or `岗位要求`.
9. Import using the clicked candidate's `/job_detail/...` href, not the current browser URL.
10. Never click `立即沟通`, `投递`, `发送`, phone/contact exchange, or external apply actions.

## Import Contract

Send:

```json
{
  "url": "https://www.zhipin.com/job_detail/....html",
  "rawText": "detail panel visible text",
  "source": "codex-chrome-boss-detail"
}
```

Expected market fields:

- company
- role
- salary
- location
- source
- url
- jdPath
- direction
- keywords

## Failure Handling

- No Boss tab: tell the user to open Boss in Chrome first.
- `not part of browser session`: reconnect Chrome and claim the Boss tab again.
- `加载中，请稍候`: wait, reload, or re-claim. Do not import.
- Only list text available: do not import. Click a candidate and read detail.
- Current provider lacks Chrome MCP: return a clear runtime unsupported error. Do not fallback to crawler.

# Career-Ops JD Parser Chrome Extension

Local unpacked Chrome extension for parsing logged-in job detail pages and writing the result back to the visualizer at `http://localhost:4173`.

## Install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:
   `/Users/don/Documents/career-ops/visualizer/chrome-extension`
5. Keep the Career-Ops visualizer open at `http://localhost:4173`.

## Workflow

1. Paste a Boss/Zhipin job URL in the visualizer.
2. Click `解析并记录岗位`.
3. If the card still needs parsing, click `Chrome 插件解析`.
4. The extension opens the job URL in Chrome with the current logged-in session, reads visible JD text, closes the temporary tab, and posts structured data to:
   `POST http://localhost:4173/api/recruitment-market/update-job`

## Safety

- The extension only reads visible job page text.
- It does not click apply, submit, communicate, favorite, login, or solve CAPTCHA.
- It only has host permissions for localhost and Zhipin/Boss pages.

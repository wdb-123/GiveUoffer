# Ucareer Job Importer Chrome Extension

这个扩展用于在招聘网站页面读取当前网页信息，并导入本地 Ucareer 岗位列表。

## 加载方式

1. 打开 Chrome：`chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录：`extensions/chrome-job-importer`

## 使用方式

1. 启动 Ucareer 前后端：`npm run dev:ucareer`
2. 打开 `http://127.0.0.1:12345/` 并登录
3. 在 Chrome 扩展弹窗里点击「连接本地 Ucareer」
4. 打开 Boss / 猎聘 / 智联 / 公司官网 JD 页面
5. 如果要导入当前页，点击「读取当前页」检查正文，再点击「读取并导入岗位」
6. 如果手里只有链接，把链接粘贴到「网页 URL」，按回车或点击「读取并导入岗位」

扩展会调用本地 daemon：

```http
POST http://127.0.0.1:54321/api/recruitment-market/import
```

请求体包含：

```json
{
  "url": "当前页面 URL",
  "description": "网页正文",
  "source": "Chrome 网页插件"
}
```

如果弹窗 URL 输入框里有链接，扩展会优先打开该链接、读取页面正文，再提交到 daemon；否则读取当前活动标签页。

## 权限说明

- `activeTab` / `scripting`：读取当前打开的招聘页面正文。
- `tabs`：查找本地 Ucareer 页面以读取登录 session。
- `storage`：保存本地 daemon 地址和 session token。
- `host_permissions`：允许访问招聘网站页面和本地 Ucareer daemon。

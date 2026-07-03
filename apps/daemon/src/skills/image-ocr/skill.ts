import type { SkillDefinition } from "@ucareer/shared";

export const imageOcrSkill: SkillDefinition = {
  id: "image.ocr",
  label: "图片文字识别",
  domain: "agent_workspace",
  description: "从截图、图片附件中提取文字，适合 OCR、识别截图内容、读取图片里的文字。",
  inputKinds: ["image_ocr"],
  defaultProviderId: "codex",
  risk: "low",
  ui: {
    primaryPage: "agent",
    pages: ["agent"],
    entryActions: [
      {
        id: "image.ocr_extract_text",
        label: "提取图片文字",
        description: "读取已上传图片附件的 OCR 文本并整理为可复制内容。",
        kind: "primary",
        inputKind: "image_ocr",
        promptTemplate: "请提取图片附件中的文字。只输出识别文本和必要的简短说明，不要生成 Canvas 卡片、字段表或工作流报告。",
        capabilities: ["read", "import"],
        outputArtifacts: ["ocr_text"],
      },
    ],
    quickPrompts: [
      "帮我提取图片中的文字。",
      "识别这张截图里的内容。",
    ],
  },
  fileManagement: {
    intakeFolder: "images",
    acceptedAttachmentKinds: ["image"],
    acceptedExtensions: [".png", ".jpg", ".jpeg", ".webp"],
    readPaths: ["workspace/ops/imports/agent-attachments/{date}/images", "workspace/ops/imports/agent-attachments/{date}/inbox"],
    writePaths: ["workspace/ops/exports"],
    outputArtifacts: ["ocr_text"],
  },
};

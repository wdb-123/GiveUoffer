---
name: image-ocr
description: Extract text from screenshot and image attachments using parsed OCR text from the attachment parser.
---

# Image OCR

Use this skill when the user asks to extract text from a screenshot or image.

The attachment parser runs local OCR during upload when possible. Read the uploaded attachment section in the prompt:

- If `Parsed text:` exists, return the extracted text cleanly.
- If parsed text is empty and the summary mentions missing language support, explain which OCR language pack is missing.
- Do not claim OCR succeeded when the attachment parser returned no text.

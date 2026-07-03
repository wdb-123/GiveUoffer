from __future__ import annotations

import html
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .workspace import safe_child, workspace_data_path

EXPORT_FORMATS = {"md", "html", "pdf", "docx"}
EXPORT_STYLES = {"classic", "compact", "ats", "bluebar"}


def export_resume(workspace_root: Path, payload: dict[str, Any]) -> dict[str, Any]:
    source_file = _validate_resume_file(str(payload.get("file") or ""))
    export_format = str(payload.get("format") or "").lower()
    if export_format not in EXPORT_FORMATS:
        raise ValueError(f"Unsupported export format: {export_format}")
    style = _normalize_style(payload.get("style"))
    resumes_dir = workspace_data_path(workspace_root, "resumeLibrary")
    source_path = safe_child(resumes_dir, source_file)
    if not source_path.exists() or not source_path.is_file():
        raise ValueError(f"Resume not found: {source_file}")
    markdown = source_path.read_text(encoding="utf-8")
    title = _markdown_title(markdown) or source_file.removesuffix(".md")
    output_dir = workspace_data_path(workspace_root, "resumeExports")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = f"{source_file.removesuffix('.md')}-{style}-{export_format}.{export_format}"
    output_path = safe_child(output_dir, output_file)
    _write_export(output_path, markdown, title, export_format, style)
    return {
        "file": output_file,
        "sourceFile": source_file,
        "format": export_format,
        "style": style,
        "outputPath": str(output_path),
        "sizeBytes": output_path.stat().st_size,
        "exportedAt": _now(),
    }


def exported_resume_file(workspace_root: Path, file: str) -> Path | None:
    if not _is_export_file(file):
        return None
    output_dir = workspace_data_path(workspace_root, "resumeExports")
    path = safe_child(output_dir, Path(file).name)
    if not path.exists() or not path.is_file():
        return None
    return path


def export_content_type(file: str) -> str:
    suffix = Path(file).suffix.lower()
    if suffix == ".pdf":
        return "application/pdf"
    if suffix == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if suffix == ".html":
        return "text/html; charset=utf-8"
    return "text/markdown; charset=utf-8"


def _write_export(path: Path, markdown: str, title: str, export_format: str, style: str) -> None:
    if export_format == "md":
        path.write_text(markdown, encoding="utf-8")
    elif export_format == "html":
        path.write_text(_render_html(markdown, title, style), encoding="utf-8")
    elif export_format == "pdf":
        path.write_bytes(_render_basic_pdf(_markdown_plain_text(markdown)))
    elif export_format == "docx":
        path.write_bytes(_render_basic_docx(_markdown_plain_text(markdown)))


def _render_html(markdown: str, title: str, style: str) -> str:
    body = "\n".join(_markdown_blocks(markdown))
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>{_style_css(style)}</style>
</head>
<body class="resume-export-{style}">
<main class="resume-page">{body}</main>
</body>
</html>
"""


def _markdown_blocks(markdown: str) -> list[str]:
    blocks: list[str] = []
    in_list = False
    for raw in markdown.splitlines():
        line = raw.strip()
        if not line:
            if in_list:
                blocks.append("</ul>")
                in_list = False
            continue
        bullet = re.match(r"^[-*]\s+(.+)$", line)
        if bullet:
            if not in_list:
                blocks.append("<ul>")
                in_list = True
            blocks.append(f"<li>{html.escape(_strip_inline_markdown(bullet.group(1)))}</li>")
            continue
        if in_list:
            blocks.append("</ul>")
            in_list = False
        if line.startswith("# "):
            blocks.append(f"<h1>{html.escape(_strip_inline_markdown(line[2:]))}</h1>")
        elif line.startswith("## "):
            blocks.append(f"<h2>{html.escape(_strip_inline_markdown(line[3:]))}</h2>")
        elif line.startswith("### "):
            blocks.append(f"<h3>{html.escape(_strip_inline_markdown(line[4:]))}</h3>")
        else:
            blocks.append(f"<p>{html.escape(_strip_inline_markdown(line))}</p>")
    if in_list:
        blocks.append("</ul>")
    return blocks


def _style_css(style: str) -> str:
    compact = "font-size:12px;line-height:1.35;" if style == "compact" else "font-size:13px;line-height:1.55;"
    ats = "font-family:Arial,sans-serif;color:#111827;" if style == "ats" else "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#1f2937;"
    accent = "#2c638f" if style == "bluebar" else "#0f172a"
    return f"""
@page {{ size: A4; margin: 0; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:#fff; {ats} }}
.resume-page {{ width:210mm; min-height:297mm; margin:0 auto; padding:24mm 22mm; {compact} }}
h1 {{ color:{accent}; font-size:22px; margin:0 0 10px; border-bottom:3px solid {accent}; padding-bottom:8px; }}
h2 {{ color:{accent}; font-size:15px; margin:14px 0 6px; border-bottom:1px solid #d8dee8; padding-bottom:3px; }}
h3 {{ font-size:13px; margin:8px 0 4px; }}
p {{ margin:4px 0; }}
ul {{ margin:4px 0 8px 18px; padding:0; }}
li {{ margin:2px 0; }}
"""


def _render_basic_pdf(text: str) -> bytes:
    lines = [_pdf_escape(line[:110]) for line in text.splitlines()[:70]]
    stream_lines = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
    for index, line in enumerate(lines):
        if index:
            stream_lines.append("T*")
        stream_lines.append(f"({line}) Tj")
    stream_lines.append("ET")
    stream = "\n".join(stream_lines).encode("latin-1", errors="replace")
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        f"5 0 obj << /Length {len(stream)} >> stream\n".encode("ascii") + stream + b"\nendstream endobj\n",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(output))
        output.extend(obj)
    xref = len(output)
    output.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    return bytes(output)


def _render_basic_docx(text: str) -> bytes:
    import io
    buffer = io.BytesIO()
    paragraphs = "\n".join(f"<w:p><w:r><w:t>{html.escape(line)}</w:t></w:r></w:p>" for line in text.splitlines()[:200])
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{paragraphs}<w:sectPr/></w:body></w:document>"""
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>""")
        docx.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>""")
        docx.writestr("word/document.xml", document)
    return buffer.getvalue()


def _markdown_plain_text(markdown: str) -> str:
    lines = []
    for line in markdown.splitlines():
        clean = re.sub(r"^#{1,6}\s*", "", line)
        clean = re.sub(r"^[-*]\s+", "• ", clean)
        lines.append(_strip_inline_markdown(clean))
    return "\n".join(lines)


def _strip_inline_markdown(value: str) -> str:
    return re.sub(r"\[(.+?)\]\(.+?\)", r"\1", re.sub(r"`(.+?)`|\*\*(.+?)\*\*", lambda m: m.group(1) or m.group(2) or "", value))


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _validate_resume_file(file: str) -> str:
    if not re.match(r"^[^/\\]+\.md$", file) or file in {"README.md", "ARCHITECTURE.md"}:
        raise ValueError("Invalid resume file")
    return file


def _is_export_file(file: str) -> bool:
    return bool(file) and not file.startswith(".") and not re.search(r"[/\\]", file) and bool(re.search(r"\.(md|html|pdf|docx)$", file, re.I))


def _normalize_style(value: Any) -> str:
    style = str(value or "classic")
    return style if style in EXPORT_STYLES else "classic"


def _markdown_title(markdown: str) -> str:
    match = re.search(r"^#\s+(.+)$", markdown, re.M)
    return match.group(1).strip() if match else ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

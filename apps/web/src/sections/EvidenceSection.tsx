import type { EvidenceRequestsOverview } from "@ucareer/shared";
import { useMemo, useState } from "react";
import { Panel } from "../ui/Panel";

interface EvidenceSectionProps {
  evidenceRequests: EvidenceRequestsOverview | null;
  onFulfillEvidence(requestId: string, content: string): void;
  onSaveEvidenceNote(content: string): void;
}

export function EvidenceSection({ evidenceRequests, onFulfillEvidence, onSaveEvidenceNote }: EvidenceSectionProps) {
  const [note, setNote] = useState("");
  const records = useMemo(
    () => [...(evidenceRequests?.requests || [])].sort(compareEvidenceRecords),
    [evidenceRequests],
  );
  const openRecords = records.filter((record) => record.status === "open");
  const canSave = note.trim().length > 0;

  function saveNote() {
    const content = note.trim();
    if (!content) return;
    onSaveEvidenceNote(content);
    setNote("");
  }

  return (
    <div className="evidence-workspace evidence-notebook">
      <Panel className="evidence-note-header" variant="workbench">
        <div>
          <h2>复盘中心</h2>
          <p>随手写下投递、沟通、面试、拒信或方向判断。系统会把每条记录保存到本地复盘笔记里。</p>
        </div>
        <div className="evidence-note-stats" aria-label="复盘统计">
          <span><strong>{records.length}</strong>记录</span>
          <span><strong>{openRecords.length}</strong>待补</span>
        </div>
      </Panel>

      <Panel className="evidence-note-panel">
        <label className="evidence-note-editor">
          <span>复盘笔记</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="随便写：今天投了哪些岗位、哪封邮件有反馈、面试哪里卡住、下一步想怎么调整……"
          />
        </label>
        <div className="evidence-note-actions">
          <button type="button" disabled={!canSave} onClick={saveNote}>保存记录</button>
          <small>{canSave ? `${note.trim().length} 字` : "输入内容后保存"}</small>
        </div>
      </Panel>

      <section className="evidence-records" aria-label="复盘记录列表">
        <div className="evidence-records-head">
          <h3>记录列表</h3>
          <span>{records.length ? `${records.length} 条` : "暂无记录"}</span>
        </div>
        {records.length ? (
          <div className="evidence-record-list">
            {records.map((record) => (
              <article className="evidence-record-item" key={record.id}>
                <div className="evidence-record-main">
                  <strong>{record.direction || "复盘记录"}</strong>
                  <p>{record.currentEvidence || record.gap || "暂无内容"}</p>
                  <div className="evidence-record-meta">
                    <span>{statusLabel(record.status)}</span>
                    <span>{priorityLabel(record.priority)}</span>
                    {record.targetFile ? <span>{record.targetFile}</span> : null}
                  </div>
                </div>
                {record.status === "open" ? (
                  <button
                    type="button"
                    className="evidence-record-action"
                    onClick={() => onFulfillEvidence(record.id, record.currentEvidence || record.gap || record.direction)}
                  >
                    标记已记录
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="evidence-empty-state">还没有复盘记录。先在上面写一条。</div>
        )}
      </section>
    </div>
  );
}

function compareEvidenceRecords(
  a: EvidenceRequestsOverview["requests"][number],
  b: EvidenceRequestsOverview["requests"][number],
): number {
  return recordTime(b) - recordTime(a);
}

function recordTime(record: EvidenceRequestsOverview["requests"][number]): number {
  const match = record.id.match(/(?:note-|ev-)([a-z0-9]+)/iu)?.[1];
  if (!match) return 0;
  const parsed = Number.parseInt(match, 36);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(status: string): string {
  if (status === "open") return "待补";
  if (status === "fulfilled") return "已记录";
  return status || "记录";
}

function priorityLabel(priority: string): string {
  if (priority === "high") return "重要";
  if (priority === "medium") return "普通";
  if (priority === "low") return "笔记";
  return priority || "笔记";
}

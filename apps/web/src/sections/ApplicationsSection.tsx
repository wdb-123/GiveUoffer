import type { ApplicationsOverview } from "@offeru/shared";
import { useState } from "react";
import { Panel } from "../ui/Panel";
import { SectionHeading } from "../ui/SectionHeading";

export interface ApplicationEventFormInput {
  application_id: string;
  company: string;
  role: string;
  event: string;
  next_action: string;
  note: string;
}

interface ApplicationsSectionProps {
  applications: ApplicationsOverview | null;
  onCreateEvent(input: ApplicationEventFormInput): void;
  onUpdateLatestEvent(applicationId: string): void;
  onDeleteLatestEvent(eventId: string): void;
}

export function ApplicationsSection({ applications, onCreateEvent, onUpdateLatestEvent, onDeleteLatestEvent }: ApplicationsSectionProps) {
  const [emailText, setEmailText] = useState("");
  const [draft, setDraft] = useState<ApplicationEventFormInput | null>(null);
  const emptyDraft = {
    application_id: "",
    company: "",
    role: "",
    event: "applied",
    next_action: "",
    note: "",
  };

  function parseProgressEmail() {
    const text = emailText.trim();
    if (!text) {
      setDraft(null);
      return;
    }
    const subject = text.match(/Subject:\s*(.+)/i)?.[1]?.trim() || "";
    const company = text.match(/(?:From|发件人):\s*([^<\n]+)/i)?.[1]?.replace(/recruiting|hr|talent/gi, "").trim() || "";
    const isInterview = /interview|面试|邀约|预约/i.test(text);
    const isRejected = /reject|unfortunately|拒绝|不合适/i.test(text);
    const isResponded = /reply|回复|通知|invitation|邀约/i.test(text);
    setDraft({
      application_id: applications?.applications[0]?.id || "001",
      company: company || "待确认公司",
      role: subject || "待确认岗位",
      event: isInterview ? "interview" : isRejected ? "rejected" : isResponded ? "responded" : "note",
      next_action: isInterview ? "确认面试时间并准备面试材料" : isRejected ? "记录拒信并复盘原因" : "复核邮件内容并确认下一步",
      note: text.slice(0, 180),
    });
  }

  function confirmDraft() {
    if (!draft) return;
    onCreateEvent(draft);
  }

  const pipelineApplications = (applications?.applications || []).filter((application) => Boolean(application.latestEvent) || Number(application.eventCount || 0) > 0);

  return (
    <div className="applications-workspace applications-import-workspace">
      <header className="applications-import-header">
        <div>
          <h1>投递进度导入</h1>
          <p>data/applications.md</p>
        </div>
      </header>

      <div className="applications-import-grid">
        <Panel className="applications-mail-panel">
          <h2>粘贴邮件内容</h2>
          <textarea
            value={emailText}
            onChange={(event) => setEmailText(event.target.value)}
            placeholder={"支持投递回执、面试邀请、测评通知和拒信。解析后确认，再写入进度。\n\n示例：Subject: Interview invitation\nFrom: recruiting@example.com\n请在 2026-06-10 前预约面试..."}
          />
          <div className="applications-import-actions">
            <button type="button" onClick={parseProgressEmail}>解析进度</button>
            <button type="button" className="secondary" onClick={() => { setEmailText(""); setDraft(null); }}>清空</button>
          </div>
        </Panel>

        <Panel className="applications-result-panel">
          <div className="applications-panel-title">
            <h2>解析结果</h2>
            <button type="button" className="text-button" disabled={!draft} onClick={confirmDraft}>确认后入库</button>
          </div>
          <div className={draft ? "applications-result-box has-result" : "applications-result-box"}>
            {draft ? (
              <dl>
                <div><dt>岗位编号</dt><dd>#{draft.application_id}</dd></div>
                <div><dt>公司</dt><dd>{draft.company}</dd></div>
                <div><dt>岗位</dt><dd>{draft.role}</dd></div>
                <div><dt>事件</dt><dd>{eventLabel(draft.event)}</dd></div>
                <div><dt>下一步</dt><dd>{draft.next_action}</dd></div>
              </dl>
            ) : (
              <p>识别出的事件、下一步动作和入库命令会显示在这里。先粘贴一封邮件并点击“解析进度”。</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel className="applications-pipeline-panel">
        <div className="applications-panel-title">
          <h2>我的投递管线</h2>
          <span>最新进度</span>
        </div>
        <div className="applications-pipeline-list">
          {pipelineApplications.length ? pipelineApplications.slice(0, 12).map((application) => (
            <article className="application-row" key={application.id}>
              <div>
                <strong>#{application.id} {application.company} · {application.role}</strong>
                <p>{application.date} · {application.status} · {application.scoreRaw}</p>
                {application.notes ? <p>{application.notes}</p> : null}
                {application.latestEvent ? (
                  <div className="approval-actions">
                    <button type="button" className="secondary" onClick={() => onUpdateLatestEvent(application.id)}>
                      更新最近事件
                    </button>
                    <button type="button" className="secondary" onClick={() => onDeleteLatestEvent(application.latestEvent?.event_id || "")}>
                      删除最近事件
                    </button>
                  </div>
                ) : null}
              </div>
              <span>{application.statusKey}</span>
            </article>
          )) : (
            <div className="applications-empty-pipeline">
              还没有导入的投递进度。先解析一封真实邮件，确认入库后，这里才会形成你的投递时间线。
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function eventLabel(event: string) {
  return ({ applied: "已投递", responded: "已回复", interview: "面试", rejected: "拒绝", note: "备注" } as Record<string, string>)[event] || event;
}

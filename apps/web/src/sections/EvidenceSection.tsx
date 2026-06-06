import type { EvidenceRequestsOverview } from "@offeru/shared";
import { useState } from "react";
import { Panel } from "../ui/Panel";
import { SectionHeading } from "../ui/SectionHeading";

interface EvidenceSectionProps {
  evidenceRequests: EvidenceRequestsOverview | null;
  onFulfillEvidence(requestId: string, content: string): void;
}

export function EvidenceSection({ evidenceRequests, onFulfillEvidence }: EvidenceSectionProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const requests = evidenceRequests?.requests || [];
  const highPriority = requests.filter((request) => request.priority === "high");
  const mediumPriority = requests.filter((request) => request.priority === "medium");
  const lowPriority = requests.filter((request) => request.priority === "low");
  const openRequests = requests.filter((request) => request.status === "open");
  const topQueue = [...highPriority, ...mediumPriority, ...lowPriority].slice(0, 5);
  const directionCount = new Set(requests.map((request) => request.direction)).size;

  return (
    <div className="evidence-workspace">
      <Panel className="evidence-overview-panel evidence-brief-panel" variant="workbench">
        <SectionHeading
          eyebrow="Job Search Review"
          title="复盘中心"
          summary="只回答三个问题：卡在哪、为什么卡、下一步做什么。复盘对象是简历命中、投递反馈和面试表现。"
          meta={evidenceRequests?.updatedAt ? `更新于 ${evidenceRequests.updatedAt}` : "准备中"}
        />
      {evidenceRequests ? (
        <div className="evidence-summary-strip">
          <div>
            <strong>{openRequests.length}</strong>
            <span>待处理卡点</span>
          </div>
          <div>
            <strong>{highPriority.length}</strong>
            <span>影响邀约</span>
          </div>
          <div>
            <strong>{directionCount}</strong>
            <span>岗位方向</span>
          </div>
          <div>
            <strong>{Math.round(((requests.length - openRequests.length) / Math.max(requests.length, 1)) * 100)}%</strong>
            <span>修复率</span>
          </div>
        </div>
      ) : <p>证据请求未加载。</p>}
      </Panel>

      <div className="evidence-review-layout">
        <Panel className="evidence-board-panel evidence-review-panel">
          <SectionHeading
            title="现在卡在哪里"
            summary="按求职漏斗看，不展开大段材料。每项只保留结论、原因和一个明确动作。"
            meta={`${topQueue.length} 项`}
          />
          <div className="evidence-review-list">
            {topQueue.map((request, index) => (
              <article className={`evidence-card evidence-review-item evidence-compact-review priority-${request.priority}`} key={request.id}>
                <div className="evidence-review-main">
                  <div className="evidence-review-header">
                    <div>
                      <div className="evidence-review-title">
                        <span>{index + 1}</span>
                        <strong>{request.direction}</strong>
                      </div>
                      <p>{request.gap}</p>
                    </div>
                    <div className="evidence-review-meta">
                      <span>{priorityLabel(request.priority)}</span>
                      <small>{request.id}</small>
                    </div>
                  </div>
                  <div className="evidence-review-three">
                    <div>
                      <span>卡点</span>
                      <p>{categoryLabel(request.direction)} 证据不够直接。</p>
                    </div>
                    <div>
                      <span>原因</span>
                      <p>{shortText(request.marketSignal)}</p>
                    </div>
                    <div>
                      <span>下一步</span>
                      <p>{request.askHuman[0] || "补充一条可验证事实。"}</p>
                    </div>
                  </div>
                  <details className="evidence-quick-note">
                    <summary>补充事实</summary>
                    <textarea
                      className="compact-textarea"
                      placeholder="写一条事实：场景、动作、指标、截图或面试反馈。"
                      value={drafts[request.id] || ""}
                      onChange={(event) => setDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                    />
                    <div className="evidence-card-actions">
                      <button
                        type="button"
                        onClick={() => {
                          onFulfillEvidence(request.id, drafts[request.id] || "");
                          setDrafts((current) => ({ ...current, [request.id]: "" }));
                        }}
                      >
                        保存
                      </button>
                      <span>{request.targetFile}</span>
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <aside className="evidence-review-rail">
          <Panel className="evidence-rail-panel">
            <SectionHeading title="看哪一类" summary="从求职漏斗定位问题。" meta="筛选" />
            <div className="evidence-filter-stack">
              <button type="button">全部卡点 {requests.length}</button>
              <button type="button" className="secondary">简历命中 {highPriority.length}</button>
              <button type="button" className="secondary">面试表达 {mediumPriority.length}</button>
              <button type="button" className="secondary">长期补强 {lowPriority.length}</button>
            </div>
          </Panel>

          <Panel className="evidence-rail-panel">
            <SectionHeading title="下周动作" summary="复盘最后必须落到动作。" meta="3 件事" />
            <div className="evidence-report-list">
              <div>
                <span>先修简历证据</span>
                <strong>{highPriority[0]?.direction || "暂无"}</strong>
              </div>
              <div>
                <span>再准备面试说法</span>
                <strong>{highPriority[0]?.gap || "暂无高优先缺口"}</strong>
              </div>
              <div>
                <span>最后复投验证</span>
                <strong>更新材料后，用新版本投 3 个同方向岗位。</strong>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function priorityLabel(priority: string): string {
  if (priority === "high") return "优先补";
  if (priority === "medium") return "建议补";
  if (priority === "low") return "可稍后";
  return "待复盘";
}

function masteryLabel(status: string): string {
  if (status === "done" || status === "completed") return "已掌握";
  if (status === "reviewing") return "复盘中";
  if (status === "verified") return "已验证";
  return "未掌握";
}

function categoryLabel(direction: string): string {
  if (direction.includes("RAG") || direction.includes("AI")) return "AI / RAG";
  if (direction.includes("机器人")) return "机器人";
  if (direction.includes("SDK")) return "SDK";
  if (direction.includes("所有方向")) return "通用能力";
  return "岗位方向";
}

function shortText(value: string): string {
  if (value.length <= 58) return value;
  return `${value.slice(0, 58)}...`;
}

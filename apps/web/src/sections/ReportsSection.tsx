import type { ReportDocument, ReportsOverview } from "@ucareer/shared";
import { Panel } from "../ui/Panel";
import { SectionHeading } from "../ui/SectionHeading";

interface ReportsSectionProps {
  reports: ReportsOverview | null;
  selectedReport: ReportDocument | null;
  onSelectReport(file: string): void;
}

export function ReportsSection({ reports, selectedReport, onSelectReport }: ReportsSectionProps) {
  return (
    <div className="reports-workspace">
      <Panel className="reports-overview-panel" variant="workbench">
      <SectionHeading
        eyebrow="Decision Support"
        title="岗位评估知识辅助"
        summary="把历史评估结论放在岗位列表旁边，用来辅助判断优先级、合法性风险和下一步动作。"
        meta={reports ? `${reports.metrics.total} reports` : "loading"}
      />
      {reports ? (
        <p className="muted">
          共 {reports.metrics.total} 份报告 · {reports.metrics.withScore} 份含评分 · {reports.metrics.highLegitimacy} 份 High legitimacy
        </p>
      ) : null}
      </Panel>

      <Panel className="reports-list-panel">
        <SectionHeading title="评估线索" meta="latest evaluations" />
      <div className="report-list">
        {(reports?.reports || []).map((report) => (
          <article className="resume-row" key={report.file}>
            <div>
              <strong>{report.title}</strong>
              <p>{report.date || "日期待确认"} · {report.score || "未评分"} · {report.legitimacy || "legitimacy 未标注"}</p>
              <p>{report.recommendation || report.excerpt}</p>
            </div>
            <button type="button" className="secondary" onClick={() => onSelectReport(report.file)}>
              查看
            </button>
          </article>
        ))}
      </div>
      </Panel>
      {selectedReport ? (
        <article className="resume-preview report-preview">
          <h3>{selectedReport.title}</h3>
          <p>{selectedReport.file}</p>
          <pre>{selectedReport.markdown.slice(0, 6000)}</pre>
        </article>
      ) : null}
    </div>
  );
}

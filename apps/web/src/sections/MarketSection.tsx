import { useMemo, useState, type FormEvent } from "react";
import type { ImportJobRequest, MarketJob, RecruitmentMarket, ReportDocument, ReportsOverview, ReportSummary, JobSearchRequest, JobSearchResult, JobSearchSource } from "@ucareer/shared";

interface MarketSectionProps {
  market: RecruitmentMarket | null;
  reports: ReportsOverview | null;
  jobSearch: {
    sources: JobSearchSource[];
    status: "idle" | "running" | "failed";
    lastResult: JobSearchResult | null;
    error: string;
    onSearch(input: JobSearchRequest): void;
  };
  selectedReport: ReportDocument | null;
  onClearReport(): void;
  onImportJob(input: ImportJobRequest): Promise<void> | void;
  onDeleteJob(jobId: string): Promise<void> | void;
  onGenerateReport(job: MarketJob): void;
  onSelectReport(file: string): void;
}

export function MarketSection({ market, reports, jobSearch, selectedReport, onClearReport, onImportJob, onDeleteJob, onGenerateReport, onSelectReport }: MarketSectionProps) {
  const [activeImportTool, setActiveImportTool] = useState<"manual" | "radar">("manual");
  const [manualUrl, setManualUrl] = useState("");
  const [manualImportStatus, setManualImportStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [manualImportMessage, setManualImportMessage] = useState("");
  const [radarSource, setRadarSource] = useState("boss-agent");
  const [radarCity, setRadarCity] = useState("深圳");
  const [radarMatch, setRadarMatch] = useState("3.0");
  const [radarKeywords, setRadarKeywords] = useState("机器人系统工程师, ROS2, 具身智能数据, AI Agent");
  const [radarMax, setRadarMax] = useState("25");
  const [radarWithDetails, setRadarWithDetails] = useState(true);
  const [companyType, setCompanyType] = useState("");
  const [direction, setDirection] = useState("");
  const [salary, setSalary] = useState("");
  const [match, setMatch] = useState("");
  const [location, setLocation] = useState("");
  const [query, setQuery] = useState("");
  const [deletingJobId, setDeletingJobId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");

  const jobs = market?.jobs || [];
  const jobsWithDetails = useMemo(() => jobs.filter(hasMarketJobDetails), [jobs]);
  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobsWithDetails.filter((job) => {
      if (companyType && inferCompanyType(job) !== companyType) return false;
      if (direction && (job.direction || "未分类方向") !== direction) return false;
      if (salary && salaryBucket(job.salary) !== salary) return false;
      if (match && Number(job.matchScore || 0) < Number(match)) return false;
      if (location && inferLocationBucket(job) !== location) return false;
      if (!normalizedQuery) return true;
      return [
        job.company,
        job.role,
        job.location,
        job.salary,
        job.source,
        job.platform,
        job.direction,
        job.fitReason,
        job.evidenceGap,
        job.importedAt,
        job.discoveredAt,
        job.createdAt,
        job.updatedAt,
        ...(job.keywords || []),
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    });
  }, [companyType, direction, jobsWithDetails, location, match, query, salary]);

  const companyTypes = useMemo(() => uniqueOptions(jobsWithDetails.map(inferCompanyType)), [jobsWithDetails]);
  const directions = useMemo(() => uniqueOptions(jobsWithDetails.map((job) => job.direction || "未分类方向")), [jobsWithDetails]);
  const locations = useMemo(() => uniqueOptions(jobsWithDetails.map(inferLocationBucket)), [jobsWithDetails]);

  async function handleManualImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = manualUrl.trim();
    if (!url) {
      setManualImportStatus("failed");
      setManualImportMessage("请先粘贴岗位链接");
      return;
    }
    setManualImportStatus("running");
    setManualImportMessage("");
    try {
      await onImportJob({ url, source: "手工导入" });
      setManualUrl("");
      setManualImportStatus("done");
      setManualImportMessage("已抓取公开页面并记录岗位");
    } catch (error) {
      setManualImportStatus("failed");
      setManualImportMessage(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function handleDeleteJob(job: MarketJob) {
    if (!job.id || deletingJobId) return;
    const label = [job.company || "待复核公司", job.role || "待复核岗位"].join(" - ");
    if (!window.confirm(`删除岗位「${label}」？`)) return;
    setDeletingJobId(job.id);
    try {
      await onDeleteJob(job.id);
    } finally {
      setDeletingJobId("");
    }
  }

  return (
    <div className="market-workspace market-legacy-workspace">
      <section className="market-bottom-tools" aria-label="岗位导入与机会雷达">
        <div className="market-rail-tabs">
          <button
            className={activeImportTool === "manual" ? "market-rail-tab is-active" : "market-rail-tab"}
            type="button"
            onClick={() => setActiveImportTool("manual")}
          >
            贴链接
          </button>
          <button
            className={activeImportTool === "radar" ? "market-rail-tab is-active" : "market-rail-tab"}
            type="button"
            onClick={() => setActiveImportTool("radar")}
          >
            跑雷达
          </button>
        </div>
        <div className="market-bottom-panels">
          {activeImportTool === "manual" ? (
            <div className="context-block market-manual-import">
              <h3>手工导入</h3>
              <form className="market-manual-form" onSubmit={handleManualImport}>
                <label className="market-manual-wide">
                  <input value={manualUrl} type="url" placeholder="粘贴 Boss / 智联 / 猎聘 / 官网 JD 链接，提交后抓取并记录" onChange={(event) => setManualUrl(event.target.value)} />
                </label>
                <div className="market-manual-actions">
                  <button className="small-button primary-small-button" type="submit" disabled={manualImportStatus === "running"}>
                    {manualImportStatus === "running" ? "抓取中" : "抓取并记录"}
                  </button>
                </div>
                {manualImportMessage ? (
                  <small className={manualImportStatus === "failed" ? "market-manual-error" : "market-manual-result"}>
                    {manualImportMessage}
                  </small>
                ) : null}
              </form>
            </div>
          ) : (
            <div className="context-block market-radar-panel">
              <div className="market-radar-form">
                <label>
                  <span>来源</span>
                  <MarketMiniSelect
                    value={radarSource}
                    onChange={setRadarSource}
                    options={[
                      { value: "codex-chrome", label: "Codex Chrome" },
                      { value: "boss-agent", label: "Boss Agent" },
                      { value: "china-crawler", label: "中国平台爬虫" },
                      { value: "all", label: "全部来源" },
                    ]}
                  />
                </label>
                <label>
                  <span>城市</span>
                  <MarketMiniSelect
                    value={radarCity}
                    onChange={setRadarCity}
                    options={[
                      { value: "深圳", label: "深圳" },
                      { value: "上海", label: "上海" },
                      { value: "北京", label: "北京" },
                      { value: "大湾区", label: "大湾区" },
                      { value: "远程", label: "远程" },
                    ]}
                  />
                </label>
                <label className="market-radar-keywords">
                  <span>关键词组</span>
                  <input value={radarKeywords} onChange={(event) => setRadarKeywords(event.target.value)} />
                </label>
                <label>
                  <span>最大新增</span>
                  <input value={radarMax} inputMode="numeric" onChange={(event) => setRadarMax(event.target.value)} />
                </label>
                <label>
                  <span>最低匹配</span>
                  <MarketMiniSelect
                    value={radarMatch}
                    onChange={setRadarMatch}
                    options={[
                      { value: "4.0", label: "4.0+" },
                      { value: "3.5", label: "3.5+" },
                      { value: "3.0", label: "3.0+" },
                      { value: "0", label: "不限" },
                    ]}
                  />
                </label>
                <div className="market-radar-switches" aria-label="雷达运行选项">
                  <label><input type="checkbox" defaultChecked /> 去重</label>
                  <label><input type="checkbox" checked={radarWithDetails} onChange={(event) => setRadarWithDetails(event.target.checked)} /> 详情抓取</label>
                  <label><input type="checkbox" defaultChecked /> 只读模式</label>
                </div>
                <button
                  className="small-button primary-small-button"
                  type="button"
                  disabled={jobSearch.status === "running"}
                  onClick={() => jobSearch.onSearch({
                    source: radarSource as JobSearchRequest["source"],
                    city: radarCity,
                    max: Number(radarMax) || 25,
                    minMatchScore: Number(radarMatch) || 0,
                    withDetails: radarWithDetails,
                    queries: radarKeywords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
                  })}
                >
                  {jobSearch.status === "running" ? "扫描中" : "开始扫描"}
                </button>
                {jobSearch.lastResult ? (
                  <small className="market-radar-result">
                    jobsearch：新增 {jobSearch.lastResult.added} 个，候选 {jobSearch.lastResult.candidatesSeen} 个，重复 {jobSearch.lastResult.duplicatesSkipped} 个
                  </small>
                ) : null}
                {jobSearch.error ? <small className="market-radar-error">{jobSearch.error}</small> : null}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="progress-panel market-list-panel market-table-panel">
        <div className="market-list-filters">
          <label>
            <span>公司类型</span>
            <MarketMiniSelect
              value={companyType}
              onChange={setCompanyType}
              options={[{ value: "", label: "全部类型" }, ...companyTypes.map(toSelectOption)]}
            />
          </label>
          <label>
            <span>方向</span>
            <MarketMiniSelect
              value={direction}
              onChange={setDirection}
              options={[{ value: "", label: "全部方向" }, ...directions.map(toSelectOption)]}
            />
          </label>
          <label>
            <span>薪资</span>
            <MarketMiniSelect
              value={salary}
              onChange={setSalary}
              options={[
                { value: "", label: "全部薪资" },
                { value: "45+", label: "45K+" },
                { value: "35-45", label: "35K-45K" },
                { value: "25-35", label: "25K-35K" },
                { value: "<25", label: "25K 以下" },
                { value: "hidden", label: "未披露" },
              ]}
            />
          </label>
          <label>
            <span>匹配</span>
            <MarketMiniSelect
              value={match}
              onChange={setMatch}
              options={[
                { value: "", label: "全部匹配" },
                { value: "4", label: "4.0+" },
                { value: "3.5", label: "3.5+" },
                { value: "3", label: "3.0+" },
              ]}
            />
          </label>
          <label>
            <span>地点</span>
            <MarketMiniSelect
              value={location}
              onChange={setLocation}
              options={[{ value: "", label: "全部地点" }, ...locations.map(toSelectOption)]}
            />
          </label>
          <label className="market-search-filter">
            <span>搜索</span>
            <input value={query} type="search" placeholder="搜公司 / 岗位 / 关键词" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        <div className="jobs-table market-table">
          {filteredJobs.length ? (
            <MarketTable
              deletingJobId={deletingJobId}
              jobs={filteredJobs}
              reports={reports?.reports || []}
              selectedJobId={selectedJobId}
              onDeleteJob={handleDeleteJob}
              onShowJobDetails={(job) => setSelectedJobId(job.id)}
              onGenerateReport={onGenerateReport}
              onSelectReport={onSelectReport}
            />
          ) : (
            <div className="empty-state">暂无符合当前筛选的岗位。</div>
          )}
        </div>
      </section>

      {selectedReport ? (
        <aside className="market-report-preview" aria-label="评估报告预览">
          <div className="market-report-preview-head">
            <div>
              <span>评估报告</span>
              <h3>{selectedReport.title}</h3>
              <p>{selectedReport.file}</p>
            </div>
            <button type="button" className="secondary compact-button" onClick={onClearReport}>关闭</button>
          </div>
          <pre>{selectedReport.markdown.slice(0, 6000)}</pre>
        </aside>
      ) : null}
      {selectedJobId ? (
        <MarketJobDetailPanel
          job={jobs.find((job) => job.id === selectedJobId) || null}
          onClose={() => setSelectedJobId("")}
          onGenerateReport={onGenerateReport}
        />
      ) : null}
    </div>
  );
}

function MarketMiniSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className="market-mini-select">
      <button
        type="button"
        className="market-mini-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || "请选择"}</span>
        <b aria-hidden="true">⌄</b>
      </button>
      {open ? (
        <div className="market-mini-select-options" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MarketTable({
  deletingJobId,
  jobs,
  reports,
  selectedJobId,
  onDeleteJob,
  onShowJobDetails,
  onGenerateReport,
  onSelectReport,
}: {
  deletingJobId: string;
  jobs: MarketJob[];
  reports: ReportSummary[];
  selectedJobId: string;
  onDeleteJob(job: MarketJob): void;
  onShowJobDetails(job: MarketJob): void;
  onGenerateReport(job: MarketJob): void;
  onSelectReport(file: string): void;
}) {
  return (
    <table>
      <colgroup>
        <col className="market-col-role" />
        <col className="market-col-salary" />
        <col className="market-col-source" />
        <col className="market-col-score" />
        <col className="market-col-jd" />
        <col className="market-col-report" />
        <col className="market-col-action" />
      </colgroup>
      <thead>
        <tr>
          <th>岗位</th>
          <th>薪资</th>
          <th>来源 / 入库</th>
          <th>评分</th>
          <th>JD</th>
          <th>评估报告</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => {
          const report = findJobReport(job, reports);
          const metaTags = marketJobMetaTags(job);
          return (
            <tr className={selectedJobId === job.id ? "is-selected" : ""} key={job.id}>
              <td className="market-job-cell">
                <strong className="market-job-company">{job.company || "待复核"}</strong>
                {job.url ? <a className="market-job-title-link" href={job.url} target="_blank" rel="noreferrer">{job.role || "待复核岗位"}</a> : <span className="market-job-title-text">{job.role || "待复核岗位"}</span>}
                {metaTags.length ? (
                  <div className="market-job-meta-row" aria-label="岗位标签">
                    {metaTags.map((tag) => (
                      <span className="market-job-meta-chip" key={`${tag.label}-${tag.value}`} title={tag.value}>
                        {tag.value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="market-salary-cell">
                <span className="salary-badge">{displaySalary(job.salary)}</span>
              </td>
              <td className="market-source-cell">
                <span>{platformLabel(job)}</span>
                <small>{marketStoredAt(job)}</small>
              </td>
              <td className="market-score-cell">
                <span className="score-badge">{typeof job.matchScore === "number" ? job.matchScore.toFixed(1) : "--"}</span>
              </td>
              <td className="market-jd-cell">
                <button className="market-detail-button" type="button" onClick={() => onShowJobDetails(job)}>查看</button>
              </td>
              <td className="market-report-cell">
                {report ? (
                  <button className="market-report-button" type="button" onClick={() => onSelectReport(report.file)}>
                    报告
                  </button>
                ) : (
                  <button className="market-generate-report-button" type="button" onClick={() => onGenerateReport(job)}>
                    生成
                  </button>
                )}
              </td>
              <td className="market-action-cell">
                <div className="market-table-actions">
                  <button className="market-focus-button" type="button">关注</button>
                  <button
                    className="market-delete-button"
                    type="button"
                    disabled={deletingJobId === job.id}
                    onClick={() => onDeleteJob(job)}
                  >
                    {deletingJobId === job.id ? "删除中" : "删除"}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MarketJobDetailPanel({
  job,
  onClose,
  onGenerateReport,
}: {
  job: MarketJob | null;
  onClose(): void;
  onGenerateReport(job: MarketJob): void;
}) {
  if (!job) return null;
  const details = [
    { label: "公司", value: job.company || "待复核" },
    { label: "岗位", value: job.role || "待复核岗位" },
    { label: "薪资", value: displaySalary(job.salary) },
    { label: "地点", value: job.location || "未披露" },
    { label: "方向", value: job.direction || "未分类" },
    { label: "来源", value: platformLabel(job) },
    { label: "入库", value: marketStoredAt(job).replace(/^入库\s*/, "") },
  ];
  const description = buildJobDescription(job);
  return (
    <aside className="market-job-detail-panel" aria-label="岗位详情">
      <div className="market-job-detail-head">
        <div>
          <span>岗位详情</span>
          <h3>{job.role || "待复核岗位"}</h3>
          <p>{job.company || "待复核公司"}</p>
        </div>
        <button type="button" className="secondary compact-button" onClick={onClose}>关闭</button>
      </div>
      <div className="market-job-detail-body">
        <dl className="market-job-detail-grid">
          {details.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {job.keywords?.length ? (
          <div className="market-job-detail-section">
            <h4>关键词</h4>
            <div className="market-job-keywords">
              {job.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
            </div>
          </div>
        ) : null}
        <MarketJobDetailSection title="匹配理由" value={job.fitReason} fallback="暂无匹配理由，建议先生成评估报告。" />
        <MarketJobDetailSection title="证据缺口" value={job.evidenceGap} fallback="暂无证据缺口记录。" />
        <MarketJobDetailSection title="职位描述" value={description} fallback="当前入库记录没有完整 JD 正文。可打开原始链接或重新从详情页抓取。" />
      </div>
      <div className="market-job-detail-actions">
        {job.url ? <a className="market-job-jump" href={job.url} target="_blank" rel="noreferrer">打开链接</a> : null}
        <button type="button" className="market-generate-report-button" onClick={() => onGenerateReport(job)}>生成报告</button>
      </div>
    </aside>
  );
}

function MarketJobDetailSection({ title, value, fallback }: { title: string; value?: string | undefined; fallback: string }) {
  return (
    <section className="market-job-detail-section">
      <h4>{title}</h4>
      <p>{value?.trim() || fallback}</p>
    </section>
  );
}

function buildJobDescription(job: MarketJob): string {
  const details = [
    job.jdPath ? `JD 文件：${job.jdPath}` : "",
    job.url ? `原始链接：${job.url}` : "",
  ].filter(Boolean);
  return details.join("\n");
}

function findJobReport(job: MarketJob, reports: ReportSummary[]) {
  if (!reports.length) return null;
  if (job.url) {
    const byUrl = reports.find((report) => report.url && report.url === job.url);
    if (byUrl) return byUrl;
  }

  const company = normalizeMatchText(job.company);
  const role = normalizeMatchText(job.role);
  if (!company && !role) return null;

  return reports.find((report) => {
    const haystack = normalizeMatchText([report.title, report.file, report.excerpt].join(" "));
    return Boolean((!company || haystack.includes(company)) && (!role || haystack.includes(role)));
  }) || null;
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function toSelectOption(value: string) {
  return { value, label: value };
}

function inferCompanyType(job: MarketJob) {
  const text = [job.company, job.role, job.direction, job.source, job.platform, ...(job.keywords || [])].join(" ");
  if (/猎头|Michael Page|Page|咨询|Recruiter/i.test(text)) return "猎头 / 第三方";
  if (/腾讯|阿里|字节|美团|华为|大疆|DJI|Baidu|百度|快手|京东/i.test(text)) return "大厂 / 平台";
  if (/机器人|具身|智元|银河|宇树|越疆|优必选|Figure|Agility/i.test(text)) return "机器人 / AI";
  if (/startup|初创|种子|天使|A轮|B轮/i.test(text)) return "创业公司";
  return "其他";
}

function inferLocationBucket(job: MarketJob) {
  const text = String(job.location || "").trim();
  if (!text) return "地点未知";
  if (/深圳/.test(text)) return "深圳";
  if (/上海/.test(text)) return "上海";
  if (/北京/.test(text)) return "北京";
  if (/广州|佛山|东莞|珠海/.test(text)) return "大湾区";
  if (/远程|remote/i.test(text)) return "远程";
  return text.split(/[·,，/]/)[0]?.trim() || text;
}

function salaryBucket(raw?: string) {
  const value = salaryValue(raw);
  if (value >= 45) return "45+";
  if (value >= 35) return "35-45";
  if (value >= 25) return "25-35";
  if (value > 0) return "<25";
  return "hidden";
}

function salaryValue(raw?: string) {
  const text = String(raw || "");
  const matches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*[kK万]/g)).map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function displaySalary(raw?: string) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  return text.replace(/^AI估算[:：]?\s*/i, "").replace(/^AI estimate[:：]?\s*/i, "").trim() || "未披露";
}

function marketJobMetaTags(job: MarketJob) {
  const tags = [
    compactMarketTag(job.location, 18),
    compactMarketTag(job.direction, 16),
  ].filter(Boolean) as string[];
  return Array.from(new Set(tags)).map((value) => ({ label: value, value }));
}

function hasMarketJobDetails(job: MarketJob) {
  if (String(job.jdPath || "").trim()) return true;
  const detailText = [job.rawText, job.description].join("\n").trim();
  return detailText.length >= 120;
}

function compactMarketTag(value?: string, maxLength = 18) {
  const text = String(value || "")
    .replace(/工作地址|点击查看地图|地图|·/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function platformLabel(job: MarketJob) {
  return job.source || job.platform || "来源未知";
}

function marketStoredAt(job: MarketJob) {
  const value = job.importedAt || job.discoveredAt || job.createdAt || job.updatedAt;
  return value ? `入库 ${formatMarketDateTime(value)}` : "入库时间待同步";
}

function formatMarketDateTime(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";

  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  return text;
}

function normalizeMatchText(value?: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

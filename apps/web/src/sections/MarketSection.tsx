import { useMemo, useState } from "react";
import type { MarketJob, RecruitmentMarket, ReportsOverview, ReportSummary } from "@offeru/shared";

interface MarketSectionProps {
  market: RecruitmentMarket | null;
  reports: ReportsOverview | null;
  onSelectReport(file: string): void;
}

export function MarketSection({ market, reports, onSelectReport }: MarketSectionProps) {
  const [companyType, setCompanyType] = useState("");
  const [direction, setDirection] = useState("");
  const [salary, setSalary] = useState("");
  const [match, setMatch] = useState("");
  const [location, setLocation] = useState("");
  const [query, setQuery] = useState("");

  const jobs = market?.jobs || [];
  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs.filter((job) => {
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
        ...(job.keywords || []),
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    });
  }, [companyType, direction, jobs, location, match, query, salary]);

  const companyTypes = useMemo(() => uniqueOptions(jobs.map(inferCompanyType)), [jobs]);
  const directions = useMemo(() => uniqueOptions(jobs.map((job) => job.direction || "未分类方向")), [jobs]);
  const locations = useMemo(() => uniqueOptions(jobs.map(inferLocationBucket)), [jobs]);

  return (
    <div className="market-workspace market-legacy-workspace">
      <section className="market-bottom-tools" aria-label="岗位导入与机会雷达">
        <div className="market-rail-tabs">
          <button className="market-rail-tab is-active" type="button">贴链接</button>
          <button className="market-rail-tab" type="button">跑雷达</button>
        </div>
        <div className="market-bottom-panels">
          <div className="context-block market-manual-import">
            <h3>手工导入</h3>
            <form className="market-manual-form" onSubmit={(event) => event.preventDefault()}>
              <label className="market-manual-wide">
                <input type="url" placeholder="直接粘贴 Boss / 智联 / 猎聘 / 官网 JD 链接" />
              </label>
              <div className="market-manual-actions">
                <button className="small-button primary-small-button" type="submit">导入并解析</button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="progress-panel market-list-panel market-table-panel">
        <div className="market-list-filters">
          <label>
            <span>公司类型</span>
            <select value={companyType} onChange={(event) => setCompanyType(event.target.value)}>
              <option value="">全部类型</option>
              {companyTypes.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>方向</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="">全部方向</option>
              {directions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>薪资</span>
            <select value={salary} onChange={(event) => setSalary(event.target.value)}>
              <option value="">全部薪资</option>
              <option value="45+">45K+</option>
              <option value="35-45">35K-45K</option>
              <option value="25-35">25K-35K</option>
              <option value="<25">25K 以下</option>
              <option value="hidden">未披露</option>
            </select>
          </label>
          <label>
            <span>匹配</span>
            <select value={match} onChange={(event) => setMatch(event.target.value)}>
              <option value="">全部匹配</option>
              <option value="4">4.0+</option>
              <option value="3.5">3.5+</option>
              <option value="3">3.0+</option>
            </select>
          </label>
          <label>
            <span>地点</span>
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">全部地点</option>
              {locations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="market-search-filter">
            <span>搜索</span>
            <input value={query} type="search" placeholder="搜公司 / 岗位 / 关键词" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        <div className="jobs-table market-table">
          {filteredJobs.length ? (
            <MarketTable jobs={filteredJobs} reports={reports?.reports || []} onSelectReport={onSelectReport} />
          ) : (
            <div className="empty-state">暂无符合当前筛选的岗位。</div>
          )}
        </div>
      </section>
    </div>
  );
}

function MarketTable({ jobs, reports, onSelectReport }: { jobs: MarketJob[]; reports: ReportSummary[]; onSelectReport(file: string): void }) {
  return (
    <table>
      <colgroup>
        <col className="market-col-role" />
        <col className="market-col-score" />
        <col className="market-col-source" />
        <col className="market-col-summary" />
        <col className="market-col-action" />
      </colgroup>
      <thead>
        <tr>
          <th>岗位</th>
          <th>初筛 / 薪资</th>
          <th>来源</th>
          <th>为什么值得看</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => {
          const report = findJobReport(job, reports);
          return (
            <tr key={job.id}>
              <td className="market-job-cell">
                <strong>{job.company || "待复核"}</strong>
                {job.url ? <a className="market-job-title-link" href={job.url} target="_blank" rel="noreferrer">{job.role || "待复核岗位"}</a> : <span>{job.role || "待复核岗位"}</span>}
                <small>{[job.id, compactMarketMeta(job)].filter(Boolean).join(" · ")}</small>
              </td>
              <td className="market-score-cell">
                <span className="score-badge">{typeof job.matchScore === "number" ? job.matchScore.toFixed(1) : "--"}</span>
                <span className="salary-badge">{displaySalary(job.salary)}</span>
              </td>
              <td className="market-source-cell">
                <span>{platformLabel(job)}</span>
                <small>{marketStoredAt(job)}</small>
              </td>
              <td className="market-reason-cell">
                <div className="market-summary-text">{job.fitReason || job.evidenceGap || job.direction || "需要打开 JD 后复核。"}</div>
              </td>
              <td className="market-action-cell">
                <div className="market-table-actions">
                  <button className="market-focus-button" type="button">重点关注</button>
                  {report ? (
                    <button className="market-report-button" type="button" onClick={() => onSelectReport(report.file)}>
                      评估报告
                    </button>
                  ) : null}
                  {job.url ? <a className="market-job-jump" href={job.url} target="_blank" rel="noreferrer">打开</a> : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
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

function compactMarketMeta(job: MarketJob) {
  return [job.location, job.direction].filter(Boolean).join(" · ");
}

function platformLabel(job: MarketJob) {
  return job.source || job.platform || "来源未知";
}

function marketStoredAt(job: MarketJob) {
  return job.id ? "已收录" : "待同步";
}

function normalizeMatchText(value?: string) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

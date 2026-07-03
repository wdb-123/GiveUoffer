import { useState } from "react";
import type { JobSearchRequest, JobSearchResult, JobSearchSource } from "@ucareer/shared";
import { MobileConnectorBar } from "./MobileConnectorBar";

export function AgentConnectorBar({
  connectionState,
  jobSearch,
  onImportMessages,
  onRunJobSearch,
}: {
  connectionState: "connected" | "disconnected" | "unknown";
  jobSearch: {
    sources: JobSearchSource[];
    status: "idle" | "running" | "failed";
    lastResult: JobSearchResult | null;
    error: string;
  };
  onImportMessages(): void | Promise<void>;
  onRunJobSearch(input?: Partial<JobSearchRequest>): void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const running = jobSearch.status === "running";
  const title = jobSearch.error
    || (jobSearch.lastResult ? `新增 ${jobSearch.lastResult.added} 个，重复 ${jobSearch.lastResult.duplicatesSkipped} 个` : "查看 jobsearch 接入状态");
  const sites = buildJobSearchSites(jobSearch.sources);

  return (
    <div className="agent-connector-strip" aria-label="连接器与搜索功能">
      <MobileConnectorBar connectionState={connectionState} onImportMessages={onImportMessages} />
      <div className="agent-jobsearch-menu">
        <button
          className="agent-jobsearch-trigger"
          type="button"
          aria-label="查看 jobsearch 已接入招聘网站"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={title}
          onPointerDown={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
          onClick={(event) => {
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
        >
          <span className="agent-jobsearch-trigger-icons" aria-hidden="true">
            {sites.slice(0, 3).map((site) => (
              <JobSearchLogo key={site.id} site={site} />
            ))}
          </span>
          <strong className="sr-only">{running ? "搜索中" : "jobsearch"}</strong>
        </button>
        {open ? (
          <JobSearchPanel
            jobSearch={jobSearch}
            onRunJobSearch={onRunJobSearch}
            sites={sites}
          />
        ) : null}
        {!open ? (
          <JobSearchPanel
            hoverOnly
            jobSearch={jobSearch}
            onRunJobSearch={onRunJobSearch}
            sites={sites}
          />
        ) : null}
      </div>
    </div>
  );
}

function JobSearchPanel({
  hoverOnly,
  jobSearch,
  onRunJobSearch,
  sites,
}: {
  hoverOnly?: boolean;
  jobSearch: {
    sources: JobSearchSource[];
    status: "idle" | "running" | "failed";
    lastResult: JobSearchResult | null;
    error: string;
  };
  onRunJobSearch(input?: Partial<JobSearchRequest>): void | Promise<void>;
  sites: ReturnType<typeof buildJobSearchSites>;
}) {
  const running = jobSearch.status === "running";
  return (
    <div className={hoverOnly ? "agent-jobsearch-panel is-hover-panel" : "agent-jobsearch-panel"} role="dialog" aria-label="jobsearch 已接入招聘网站">
      <div className="agent-jobsearch-sites">
        {sites.map((site) => (
          <button
            aria-label={`${site.label}，${site.connected ? "已接入" : "待接入"}`}
            className={site.connected ? "agent-jobsearch-site is-connected" : "agent-jobsearch-site"}
            disabled={!site.connected || running}
            key={site.id}
            onClick={() => {
              if (!site.connected || running) return;
              void onRunJobSearch({
                source: site.source,
                city: "深圳",
                max: 25,
                queries: site.queries,
              });
            }}
            type="button"
            title={`${site.label} - ${site.connected ? "点击搜索岗位" : "待接入"}`}
          >
            <JobSearchLogo site={site} />
            <em>{running ? "搜索中" : site.connected ? "搜索" : "待接入"}</em>
            <span className="agent-jobsearch-tooltip" role="tooltip">
              <strong>{site.label}</strong>
              <small>{site.connected ? "点击后搜索岗位" : "待接入"}</small>
              <span>{site.note}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="agent-jobsearch-actions" aria-label="jobsearch 操作">
        <button type="button" title="添加招聘网站" aria-label="添加招聘网站">
          <span className="agent-jobsearch-action-icon is-add" aria-hidden="true" />
          <span className="agent-jobsearch-action-tooltip" role="tooltip">添加招聘网站</span>
        </button>
        <button type="button" title="jobsearch 设置" aria-label="jobsearch 设置">
          <span className="agent-jobsearch-action-icon is-settings" aria-hidden="true" />
          <span className="agent-jobsearch-action-tooltip" role="tooltip">渠道设置</span>
        </button>
      </div>
      {jobSearch.lastResult ? (
        <small className="agent-jobsearch-result">
          上次新增 {jobSearch.lastResult.added} 个，跳过 {jobSearch.lastResult.duplicatesSkipped} 个重复
        </small>
      ) : null}
      {jobSearch.error ? <small className="agent-jobsearch-error">{jobSearch.error}</small> : null}
    </div>
  );
}

function JobSearchLogo({ site }: { site: ReturnType<typeof buildJobSearchSites>[number] }) {
  return (
    <span className="agent-jobsearch-logo" data-fallback={site.shortLabel}>
      {site.logoUrl ? (
        <img
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={site.logoUrl}
        />
      ) : null}
    </span>
  );
}

function buildJobSearchSites(sources: JobSearchSource[]) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const codexChrome = sourceMap.get("codex-chrome");
  const bossAgent = sourceMap.get("boss-agent");
  const chinaCrawler = sourceMap.get("china-crawler");
  const portals = sourceMap.get("portals");
  return [
    {
      id: "boss",
      label: "Boss 直聘",
      shortLabel: "B",
      logoUrl: "https://www.zhipin.com/favicon.ico",
      source: codexChrome?.available ? "codex-chrome" as const : bossAgent?.available ? "boss-agent" as const : "china-crawler" as const,
      queries: ["机器人系统工程师", "机器人软件工程师", "ROS2 机器人"],
      connected: Boolean(codexChrome?.available || bossAgent?.available || chinaCrawler?.available),
      note: codexChrome?.available
        ? "Codex Chrome 已接入，可读已登录 Boss 标签页"
        : bossAgent?.available ? "Boss Agent 已接入，需要本地登录态" : "平台爬虫待验证",
    },
    {
      id: "zhilian",
      label: "智联招聘",
      shortLabel: "智",
      logoUrl: "",
      source: bossAgent?.available ? "boss-agent" as const : "china-crawler" as const,
      queries: ["机器人系统工程师", "机器人软件工程师"],
      connected: Boolean(bossAgent?.available || chinaCrawler?.available),
      note: bossAgent?.available ? "Boss Agent / 智联通道可用" : "平台爬虫待验证",
    },
    {
      id: "liepin",
      label: "猎聘",
      shortLabel: "猎",
      logoUrl: "",
      source: "china-crawler" as const,
      queries: ["机器人系统工程师", "机器人软件工程师"],
      connected: Boolean(chinaCrawler?.available),
      note: chinaCrawler?.available ? "中国平台爬虫已接入" : "待接入",
    },
    {
      id: "51job",
      label: "前程无忧 51Job",
      shortLabel: "51",
      logoUrl: "https://www.51job.com/favicon.ico",
      source: "china-crawler" as const,
      queries: ["机器人系统工程师", "机器人软件工程师"],
      connected: Boolean(chinaCrawler?.available),
      note: chinaCrawler?.available ? "中国平台爬虫已接入" : "待接入",
    },
    {
      id: "lagou",
      label: "拉勾招聘",
      shortLabel: "拉",
      logoUrl: "https://www.lagou.com/favicon.ico",
      source: "china-crawler" as const,
      queries: ["机器人系统工程师", "机器人软件工程师"],
      connected: Boolean(chinaCrawler?.available),
      note: chinaCrawler?.available ? "中国平台爬虫已接入" : "待接入",
    },
    {
      id: "iguopin",
      label: "国聘",
      shortLabel: "国",
      logoUrl: "https://www.iguopin.com/favicon.ico",
      source: "china-crawler" as const,
      queries: ["机器人系统工程师", "机器人软件工程师"],
      connected: Boolean(chinaCrawler?.available),
      note: chinaCrawler?.available ? "中国平台爬虫已接入" : "待接入",
    },
    {
      id: "company-portals",
      label: "公司官网 / ATS",
      shortLabel: "ATS",
      logoUrl: "",
      source: "portals" as const,
      queries: ["机器人系统工程师", "机器人软件工程师"],
      connected: Boolean(portals?.available),
      note: portals?.available ? "portals.yml 扫描已接入" : "下一阶段接入",
    },
  ];
}

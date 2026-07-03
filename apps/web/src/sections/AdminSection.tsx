import { useEffect, useMemo, useState } from "react";
import type {
  AddTenantMemberRequest,
  AgentExecutionQueueOverview,
  AgentTask,
  AuthSession,
  BillingPlan,
  ProviderInstallStatus,
  ProviderSummary,
  TenantBilling,
  TenantMember,
  TenantMembersOverview,
  TenantPermission,
  TenantRole,
} from "@ucareer/shared";
import {
  addTenantMember,
  createTenant,
  getBillingPlans,
  getTenantBilling,
  getTenantMembers,
  removeTenantMember,
  switchTenant,
  updateTenantBillingPlan,
  updateTenantMemberRole,
} from "../api";

interface AdminSectionProps {
  executionQueue: AgentExecutionQueueOverview | null;
  installStatus: Record<string, ProviderInstallStatus>;
  providers: ProviderSummary[];
  session: AuthSession;
  tasks: AgentTask[];
  onSessionChange(session: AuthSession): void;
}

const assignableRoles: AddTenantMemberRequest["role"][] = ["admin", "member", "viewer"];
const permissionOrder: TenantPermission[] = [
  "tenant.manage",
  "users.manage",
  "agent.run",
  "agent.approve",
  "workspace.read",
  "workspace.write",
  "applications.read",
  "applications.write",
  "billing.view",
  "sync.cloud",
];

export function AdminSection(props: AdminSectionProps) {
  const [members, setMembers] = useState<TenantMembersOverview | null>(null);
  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<AddTenantMemberRequest["role"]>("member");
  const [tenantName, setTenantName] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const canManageUsers = props.session.permissions.includes("users.manage");
  const canManageTenant = props.session.permissions.includes("tenant.manage");
  const canViewBilling = props.session.permissions.includes("billing.view");
  const taskStats = useMemo(() => summarizeTasks(props.tasks, props.providers), [props.tasks, props.providers]);

  useEffect(() => {
    if (!canManageUsers) {
      setMembers(null);
      return;
    }
    void run("loadMembers", async () => {
      setMembers(await getTenantMembers());
    }, false);
  }, [canManageUsers, props.session.activeTenant.id]);

  useEffect(() => {
    if (!canViewBilling) {
      setBilling(null);
      setBillingPlans([]);
      return;
    }
    void run("loadBilling", async () => {
      const [nextBilling, nextPlans] = await Promise.all([getTenantBilling(), getBillingPlans()]);
      setBilling(nextBilling);
      setBillingPlans(nextPlans);
    }, false);
  }, [canViewBilling, props.session.activeTenant.id]);

  async function run(action: string, work: () => Promise<void>, clearMessage = true) {
    setBusy(action);
    if (clearMessage) setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="admin-workbench" aria-label="管理员设置">
      <header className="admin-hero">
        <div>
          <span className="admin-kicker">Admin Console</span>
          <h1>管理员设置</h1>
          <p>{props.session.activeTenant.name}</p>
        </div>
        <div className="admin-hero-metrics" aria-label="管理员摘要">
          <AdminMetric label="成员" value={String(members?.members.length ?? props.session.memberships.length)} />
          <AdminMetric label="运行中" value={String(props.executionQueue?.running ?? 0)} />
          <AdminMetric label="排队" value={String(props.executionQueue?.queued ?? 0)} />
          <AdminMetric label="模型" value={String(props.providers.length)} />
        </div>
      </header>

      {message ? <div className="admin-alert">{message}</div> : null}

      <div className="admin-grid">
        <section className="admin-panel admin-panel-wide" aria-label="用户管理">
          <PanelHeader title="用户管理" meta={canManageUsers ? "可编辑" : "只读"} />
          {canManageUsers ? (
            <form className="admin-inline-form" onSubmit={(event) => {
              event.preventDefault();
              const email = memberEmail.trim();
              if (!email) return;
              void run("addMember", async () => {
                setMembers(await addTenantMember({ email, role: memberRole }));
                setMemberEmail("");
              });
            }}>
              <input value={memberEmail} placeholder="账号邮箱" onChange={(event) => setMemberEmail(event.target.value)} />
              <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as AddTenantMemberRequest["role"])}>
                {assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
              <button type="submit" disabled={busy === "addMember"}>添加成员</button>
            </form>
          ) : null}
          <div className="admin-table" role="table" aria-label="成员列表">
            <div className="admin-table-row admin-table-head" role="row">
              <span role="columnheader">用户</span>
              <span role="columnheader">角色</span>
              <span role="columnheader">操作</span>
            </div>
            {(members?.members || []).map((member) => (
              <MemberRow
                key={member.account.id}
                busy={busy}
                currentAccountId={props.session.account.id}
                member={member}
                readonly={!canManageUsers}
                onRemove={() => run(`remove:${member.account.id}`, async () => {
                  setMembers(await removeTenantMember(member.account.id));
                })}
                onRoleChange={(role) => run(`role:${member.account.id}`, async () => {
                  setMembers(await updateTenantMemberRole(member.account.id, { role }));
                })}
              />
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="权限管理">
          <PanelHeader title="权限管理" meta={roleLabel(props.session.role)} />
          <div className="admin-permission-list">
            {permissionOrder.map((permission) => (
              <div className={props.session.permissions.includes(permission) ? "admin-permission is-enabled" : "admin-permission"} key={permission}>
                <span>{permissionLabel(permission)}</span>
                <strong>{props.session.permissions.includes(permission) ? "开启" : "关闭"}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-label="工作区管理">
          <PanelHeader title="工作区管理" meta={`${props.session.memberships.length} 个`} />
          <div className="admin-stack">
            {props.session.memberships.map((membership) => (
              <button
                type="button"
                className={membership.tenant.id === props.session.activeTenant.id ? "admin-workspace-row is-active" : "admin-workspace-row"}
                disabled={busy === "switchTenant" || membership.tenant.id === props.session.activeTenant.id}
                key={membership.tenant.id}
                onClick={() => run("switchTenant", async () => {
                  props.onSessionChange(await switchTenant({ tenantId: membership.tenant.id }));
                })}
              >
                <span>{membership.tenant.name}</span>
                <strong>{roleLabel(membership.role)}</strong>
              </button>
            ))}
          </div>
          {canManageTenant ? (
            <form className="admin-inline-form admin-inline-form-compact" onSubmit={(event) => {
              event.preventDefault();
              const name = tenantName.trim();
              if (!name) return;
              void run("createTenant", async () => {
                props.onSessionChange(await createTenant({ name }));
                setTenantName("");
              });
            }}>
              <input value={tenantName} placeholder="新工作区名称" onChange={(event) => setTenantName(event.target.value)} />
              <button type="submit" disabled={busy === "createTenant"}>新建</button>
            </form>
          ) : null}
        </section>

        <section className="admin-panel admin-panel-wide" aria-label="模型管理">
          <PanelHeader title="模型管理" meta={`${props.providers.length} 个 provider`} />
          <div className="admin-model-grid">
            {props.providers.map((provider) => {
              const status = props.installStatus[provider.id];
              return (
                <div className="admin-model-card" key={provider.id}>
                  <div>
                    <strong>{provider.label}</strong>
                    <span>{provider.contextWindow?.model || provider.id}</span>
                  </div>
                  <small>{formatTokenCount(provider.contextWindow?.tokens || 0)} context</small>
                  <em className={status?.installed ? "is-ok" : "is-muted"}>{status?.installed ? "已安装" : "未检测"}</em>
                </div>
              );
            })}
          </div>
        </section>

        <section className="admin-panel" aria-label="流量监控">
          <PanelHeader title="流量监控" meta={queueStatus(props.executionQueue)} />
          <QueueBars queue={props.executionQueue} />
        </section>

        <section className="admin-panel" aria-label="Token 监控">
          <PanelHeader title="Token 监控" meta={billing ? `${billing.currentMonth} · ${billing.plan.name}` : "本地执行"} />
          {billing ? (
            <BillingUsageCard
              billing={billing}
              plans={billingPlans}
              canManage={canManageTenant}
              busy={busy}
              onPlanChange={(planId) => run("updateBillingPlan", async () => {
                setBilling(await updateTenantBillingPlan({ planId }));
              })}
            />
          ) : (
            <div className="admin-token-grid">
              <AdminMetric label="任务总数" value={String(taskStats.total)} />
              <AdminMetric label="运行/排队" value={`${taskStats.active}/${taskStats.queued}`} />
              <AdminMetric label="失败" value={String(taskStats.failed)} />
              <AdminMetric label="最大上下文" value={formatTokenCount(taskStats.maxContextWindow)} />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function PanelHeader(props: { title: string; meta: string }) {
  return (
    <div className="admin-panel-header">
      <h2>{props.title}</h2>
      <span>{props.meta}</span>
    </div>
  );
}

function AdminMetric(props: { label: string; value: string }) {
  return (
    <div className="admin-metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function MemberRow(props: {
  busy: string;
  currentAccountId: string;
  member: TenantMember;
  readonly: boolean;
  onRemove(): void;
  onRoleChange(role: Exclude<TenantRole, "owner">): void;
}) {
  const isSelf = props.member.account.id === props.currentAccountId;
  const isOwner = props.member.role === "owner";
  return (
    <div className="admin-table-row" role="row">
      <span role="cell">
        <strong>{props.member.account.displayName || props.member.account.email}</strong>
        <small>{props.member.account.email}</small>
      </span>
      <span role="cell">
        {isOwner || props.readonly ? (
          <b>{roleLabel(props.member.role)}</b>
        ) : (
          <select
            value={props.member.role}
            disabled={isSelf || props.busy === `role:${props.member.account.id}`}
            onChange={(event) => props.onRoleChange(event.target.value as Exclude<TenantRole, "owner">)}
          >
            {assignableRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
        )}
      </span>
      <span role="cell">
        <button
          type="button"
          disabled={props.readonly || isSelf || isOwner || props.busy === `remove:${props.member.account.id}`}
          onClick={props.onRemove}
        >
          移除
        </button>
      </span>
    </div>
  );
}

function QueueBars(props: { queue: AgentExecutionQueueOverview | null }) {
  const queue = props.queue;
  if (!queue) {
    return <div className="admin-empty">暂无队列数据</div>;
  }
  return (
    <div className="admin-queue-bars">
      <QueueBar label="当前租户" running={queue.currentTenant.running} queued={queue.currentTenant.queued} maxRunning={queue.maxConcurrentPerTenant} maxQueued={queue.maxQueuedPerTenant} />
      <QueueBar label="全局容量" running={queue.running} queued={queue.queued} maxRunning={queue.maxConcurrent} maxQueued={queue.maxQueued} />
      <div className="admin-queue-meta">
        <span>{queue.currentTenant.tenantName}</span>
        <strong>独占任务 {queue.queuedExclusive}</strong>
      </div>
    </div>
  );
}

function QueueBar(props: { label: string; running: number; queued: number; maxRunning: number; maxQueued: number }) {
  const percent = capacityPercent(props.running + props.queued, props.maxRunning + props.maxQueued);
  return (
    <div className="admin-queue-bar">
      <div>
        <span>{props.label}</span>
        <strong>{props.running}/{props.maxRunning} 运行 · {props.queued}/{props.maxQueued} 排队</strong>
      </div>
      <i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i>
    </div>
  );
}

function BillingUsageCard(props: {
  billing: TenantBilling;
  plans: BillingPlan[];
  canManage: boolean;
  busy: string;
  onPlanChange(planId: BillingPlan["id"]): void;
}) {
  const { billing } = props;
  return (
    <div className="admin-billing-card">
      <div className="admin-billing-head">
        <div>
          <strong>{billing.plan.name}</strong>
          <span>{formatTokenCount(billing.usage.totalTokens)} / {formatTokenCount(billing.quota.monthlyTokenLimit)} tokens</span>
        </div>
        <b>{billing.quota.usedPercent}%</b>
      </div>
      <div className={billing.quota.exceeded ? "admin-billing-bar is-exceeded" : "admin-billing-bar"} aria-label="套餐 token 使用率">
        <i style={{ width: `${billing.quota.usedPercent}%` }} />
      </div>
      <div className="admin-token-grid">
        <AdminMetric label="剩余" value={formatTokenCount(billing.quota.remainingTokens)} />
        <AdminMetric label="输入" value={formatTokenCount(billing.usage.inputTokens)} />
        <AdminMetric label="缓存" value={formatTokenCount(billing.usage.cachedInputTokens)} />
        <AdminMetric label="输出" value={formatTokenCount(billing.usage.outputTokens)} />
      </div>
      <small className="admin-billing-note">任务计费次数 {billing.usage.taskCount} · {billing.usage.lastUsedAt ? `最近 ${formatDateTime(billing.usage.lastUsedAt)}` : "暂无消耗"}</small>
      <div className="admin-plan-list" aria-label="套餐选择">
        {props.plans.map((plan) => (
          <button
            type="button"
            className={plan.id === billing.plan.id ? "is-active" : ""}
            disabled={!props.canManage || props.busy === "updateBillingPlan" || plan.id === billing.plan.id}
            key={plan.id}
            onClick={() => props.onPlanChange(plan.id)}
          >
            <strong>{plan.name}</strong>
            <span>{formatTokenCount(plan.monthlyTokenLimit)} / 月</span>
            <em>{plan.monthlyPriceCents ? `¥${(plan.monthlyPriceCents / 100).toFixed(0)}` : "免费"}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function summarizeTasks(tasks: AgentTask[], providers: ProviderSummary[]) {
  return {
    active: tasks.filter((task) => task.status === "running").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    queued: tasks.filter((task) => task.status === "queued").length,
    total: tasks.length,
    maxContextWindow: Math.max(0, ...providers.map((provider) => provider.contextWindow?.tokens || 0)),
  };
}

function queueStatus(queue: AgentExecutionQueueOverview | null): string {
  if (!queue) return "未连接";
  if (queue.saturated || queue.tenantSaturated) return "已满";
  if (queue.running || queue.queued) return "执行中";
  return "空闲";
}

function capacityPercent(current: number, max: number): number {
  if (max <= 0) return current > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

function roleLabel(role: TenantRole): string {
  if (role === "owner") return "所有者";
  if (role === "admin") return "管理员";
  if (role === "member") return "成员";
  return "只读";
}

function permissionLabel(permission: TenantPermission): string {
  const labels: Record<TenantPermission, string> = {
    "tenant.manage": "租户管理",
    "users.manage": "用户管理",
    "agent.run": "运行 Agent",
    "agent.approve": "审批任务",
    "workspace.read": "读取工作区",
    "workspace.write": "写入工作区",
    "applications.read": "读取投递",
    "applications.write": "写入投递",
    "billing.view": "查看账单",
    "sync.cloud": "云同步",
  };
  return labels[permission];
}

function formatTokenCount(tokens: number): string {
  if (!tokens) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

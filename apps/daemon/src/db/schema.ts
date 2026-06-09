import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentTasks = sqliteTable("agent_tasks", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  workspacePath: text("workspace_path").notNull(),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  skillId: text("skill_id"),
  workflowId: text("workflow_id"),
  workflowRunId: text("workflow_run_id"),
  inputKind: text("input_kind"),
  sourceText: text("source_text"),
  routeDecision: text("route_decision"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  skillId: text("skill_id"),
  taskId: text("task_id"),
  currentStepId: text("current_step_id"),
  status: text("status").notNull(),
  sourceText: text("source_text"),
  routeDecision: text("route_decision"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workflowStepRuns = sqliteTable("workflow_step_runs", {
  id: text("id").primaryKey(),
  workflowRunId: text("workflow_run_id").notNull(),
  stepId: text("step_id").notNull(),
  status: text("status").notNull(),
  taskId: text("task_id"),
  approvalId: text("approval_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentEvents = sqliteTable("agent_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});

export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  action: text("action").notNull(),
  risk: text("risk").notNull(),
  summary: text("summary").notNull(),
  command: text("command"),
  cwd: text("cwd"),
  affectedPaths: text("affected_paths"),
  createdAt: text("created_at").notNull(),
});

export const approvalDecisions = sqliteTable("approval_decisions", {
  approvalId: text("approval_id").primaryKey(),
  taskId: text("task_id").notNull(),
  decision: text("decision").notNull(),
  note: text("note"),
  decidedAt: text("decided_at").notNull(),
});

export const approvalGrants = sqliteTable("approval_grants", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  providerId: text("provider_id").notNull(),
  workspacePath: text("workspace_path").notNull(),
  sourceApprovalId: text("source_approval_id"),
  createdAt: text("created_at").notNull(),
});

export const syncEvents = sqliteTable("sync_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  pushedAt: text("pushed_at"),
});

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tenantMemberships = sqliteTable("tenant_memberships", {
  tenantId: text("tenant_id").notNull(),
  accountId: text("account_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  token: text("token").primaryKey(),
  accountId: text("account_id").notNull(),
  activeTenantId: text("active_tenant_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const connectorCredentials = sqliteTable("connector_credentials", {
  connectorId: text("connector_id").primaryKey(),
  account: text("account").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  secretIv: text("secret_iv").notNull(),
  secretAuthTag: text("secret_auth_tag").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  verifiedAt: text("verified_at"),
});

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentTasks = sqliteTable("agent_tasks", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  workspacePath: text("workspace_path").notNull(),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
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

export const syncEvents = sqliteTable("sync_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  pushedAt: text("pushed_at"),
});

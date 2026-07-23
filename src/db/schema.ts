import { relations } from "drizzle-orm";
import { boolean, foreignKey, index, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "suspended"]);
export const registrationMethodEnum = pgEnum("registration_method", ["password", "google"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "telegram"]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "failed"]);
export const dataWorkspaceEnum = pgEnum("data_workspace", ["production", "sandbox"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  role: userRoleEnum("role").default("user").notNull(),
  approvalStatus: approvalStatusEnum("approval_status").default("pending").notNull(),
  registrationMethod: registrationMethodEnum("registration_method").default("password").notNull(),
  reviewComment: text("review_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const registrationRequest = pgTable(
  "registration_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    method: registrationMethodEnum("method").notNull(),
    status: approvalStatusEnum("status").default("pending").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    comment: text("comment"),
  },
  (table) => [
    uniqueIndex("registration_request_user_id_idx").on(table.userId),
    index("registration_request_status_idx").on(table.status, table.submittedAt),
  ],
);

export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channel: notificationChannelEnum("channel").notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: notificationStatusEnum("status").default("pending").notNull(),
    attempts: numeric("attempts", { precision: 4, scale: 0 }).default("0").notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("notification_outbox_pending_idx").on(table.status, table.nextAttemptAt)],
);

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("global"),
  testWorkspaceEnabled: boolean("test_workspace_enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

export const category = pgTable(
  "category",
  {
    workspace: dataWorkspaceEnum("workspace").default("production").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    visible: boolean("visible").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [primaryKey({ name: "category_workspace_id_pk", columns: [table.workspace, table.id] })],
);

export const plot = pgTable(
  "plot",
  {
    workspace: dataWorkspaceEnum("workspace").default("production").notNull(),
    id: text("id").notNull(),
    cadastralNumber: text("cadastral_number").notNull(),
    name: text("name").default("").notNull(),
    categoryId: text("category_id"),
    geometry: jsonb("geometry").$type<{ type: "Polygon"; coordinates: number[][][] }>().notNull(),
    areaHa: numeric("area_ha", { precision: 14, scale: 4 }).default("0").notNull(),
    projectCapacity: numeric("project_capacity", { precision: 12, scale: 2 }).default("0").notNull(),
    status: text("status").default("").notNull(),
    mainCandidateCadastral: text("main_candidate_cadastral").default("").notNull(),
    owner: text("owner").default("").notNull(),
    lessee: text("lessee").default("").notNull(),
    sourceFilename: text("source_filename"),
    pdfObjectKey: text("pdf_object_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    primaryKey({ name: "plot_workspace_id_pk", columns: [table.workspace, table.id] }),
    uniqueIndex("plot_workspace_cadastral_idx").on(table.workspace, table.cadastralNumber),
    foreignKey({ name: "plot_workspace_category_fk", columns: [table.workspace, table.categoryId], foreignColumns: [category.workspace, category.id] }).onDelete("restrict"),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspace: dataWorkspaceEnum("workspace").default("production").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    cadastralNumber: text("cadastral_number"),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_workspace_created_idx").on(table.workspace, table.createdAt),
    index("audit_log_workspace_entity_idx").on(table.workspace, table.entityType, table.entityId),
    index("audit_log_actor_idx").on(table.actorUserId, table.createdAt),
  ],
);

export const plotVersion = pgTable(
  "plot_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspace: dataWorkspaceEnum("workspace").default("production").notNull(),
    plotId: text("plot_id").notNull(),
    auditLogId: uuid("audit_log_id").notNull().references(() => auditLog.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("plot_version_audit_log_idx").on(table.auditLogId),
    index("plot_version_workspace_plot_created_idx").on(table.workspace, table.plotId, table.createdAt),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  registrationRequests: many(registrationRequest, { relationName: "registration_owner" }),
  auditEntries: many(auditLog),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const registrationRequestRelations = relations(registrationRequest, ({ one }) => ({
  applicant: one(user, { fields: [registrationRequest.userId], references: [user.id], relationName: "registration_owner" }),
  reviewer: one(user, { fields: [registrationRequest.decidedBy], references: [user.id], relationName: "registration_reviewer" }),
}));

export const plotRelations = relations(plot, ({ one }) => ({
  category: one(category, { fields: [plot.workspace, plot.categoryId], references: [category.workspace, category.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorUserId], references: [user.id] }),
}));

export const plotVersionRelations = relations(plotVersion, ({ one }) => ({
  auditEntry: one(auditLog, { fields: [plotVersion.auditLogId], references: [auditLog.id] }),
  creator: one(user, { fields: [plotVersion.createdBy], references: [user.id] }),
}));

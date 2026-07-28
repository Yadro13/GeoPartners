export type AppRole = "user" | "admin";
export type AppAccessLevel = "read" | "edit";
export type AppPermission = "plots.create" | "plots.update" | "plots.delete" | "imports.run" | "categories.manage" | "statuses.manage" | "versions.restore" | "users.manage" | "workspaces.manage";

const editorPermissions = new Set<AppPermission>(["plots.create", "plots.update"]);
const adminPermissions = new Set<AppPermission>(["plots.create", "plots.update", "plots.delete", "imports.run", "categories.manage", "statuses.manage", "versions.restore", "users.manage", "workspaces.manage"]);

export function hasPermission(user: { role: AppRole; accessLevel: AppAccessLevel }, permission: AppPermission) {
  if (user.role === "admin") return adminPermissions.has(permission);
  return user.accessLevel === "edit" && editorPermissions.has(permission);
}

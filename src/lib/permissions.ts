export type AppRole = "user" | "admin";
export type AppPermission = "plots.create" | "plots.update" | "plots.delete" | "imports.run" | "categories.manage" | "versions.restore" | "users.manage" | "workspaces.manage";

const permissions: Record<AppRole, ReadonlySet<AppPermission>> = {
  user: new Set(["plots.create", "plots.update"]),
  admin: new Set(["plots.create", "plots.update", "plots.delete", "imports.run", "categories.manage", "versions.restore", "users.manage", "workspaces.manage"]),
};

export function hasPermission(user: { role: AppRole }, permission: AppPermission) {
  return permissions[user.role].has(permission);
}

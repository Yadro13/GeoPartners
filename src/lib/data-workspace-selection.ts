export type DataWorkspace = "production" | "sandbox";

export function resolveDataWorkspace(testWorkspaceEnabled: boolean, preferredWorkspace: unknown): DataWorkspace {
  if (!testWorkspaceEnabled) return "production";
  return preferredWorkspace === "production" ? "production" : "sandbox";
}

import { workspaceSchema, type Workspace } from "../domain/schemas";
import { seedWorkspace } from "./seed";
import type { WorkspaceRepository } from "./repository";
export const STORAGE_KEY = "otr-growth:workspace:v1";
export class LocalWorkspaceRepository implements WorkspaceRepository {
  async load(): Promise<Workspace> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedWorkspace();
    const parsed = workspaceSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new Error(
        "Saved workspace could not be read. Your stored data has not been changed.",
      );
    return parsed.data;
  }
  async save(workspace: Workspace): Promise<void> {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(workspaceSchema.parse(workspace)),
    );
  }
}

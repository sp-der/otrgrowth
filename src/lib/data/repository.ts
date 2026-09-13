import type { Workspace } from "../domain/schemas";
/** Replace this adapter with authenticated API methods for Supabase persistence. */
export interface WorkspaceRepository {
  load(): Promise<Workspace>;
  save(workspace: Workspace): Promise<void>;
}

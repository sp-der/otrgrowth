"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SupabaseWorkspaceRepository } from "@/lib/data/supabase-repository";
import type { WorkspaceRepository } from "@/lib/data/repository";
import {
  workspaceSchema,
  type Business,
  type Workspace,
} from "@/lib/domain/schemas";

type Context = {
  data: Workspace;
  business: Business;
  update: (change: (current: Workspace) => Workspace) => Promise<void>;
  select: (id: string) => Promise<void>;
};
const WorkspaceContext = createContext<Context | null>(null);
const supabaseRepository = new SupabaseWorkspaceRepository();
export function WorkspaceProvider({
  children,
  repository = supabaseRepository,
}: {
  children: ReactNode;
  repository?: WorkspaceRepository;
}) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const current = useRef<Workspace | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((value) => {
        if (active) {
          current.current = value;
          setData(value);
        }
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Your synced workspace could not be loaded. Existing cloud data has not been overwritten.",
          );
      });
    return () => {
      active = false;
    };
  }, [repository]);
  const update = useCallback(
    (change: (workspace: Workspace) => Workspace) => {
      const task = queue.current.then(async () => {
        if (!current.current) throw new Error("Workspace is not ready.");
        const next = workspaceSchema.parse(change(current.current));
        await repository.save(next);
        current.current = next;
        setData(next);
      });
      queue.current = task.catch(() => {});
      return task;
    },
    [repository],
  );
  if (error)
    return (
      <div className="load-screen" role="alert">
        <h1>Workspace unavailable</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!data)
    return (
      <div className="load-screen" role="status">
        <span className="brand-mark">↗</span>
        <p>Opening your synced workspace…</p>
      </div>
    );
  const business =
    data.businesses.find((b) => b.id === data.selectedBusinessId) ??
    data.businesses[0];
  return (
    <WorkspaceContext.Provider
      value={{
        data,
        business,
        update,
        select: (id) => update((w) => ({ ...w, selectedBusinessId: id })),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("WorkspaceProvider is required");
  return ctx;
}
export function recordActivity(
  workspace: Workspace,
  businessId: string,
  title: string,
): Workspace {
  return {
    ...workspace,
    activity: [
      {
        id: crypto.randomUUID(),
        businessId,
        title,
        at: new Date().toISOString(),
      },
      ...workspace.activity,
    ].slice(0, 100),
  };
}

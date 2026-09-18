"use client";

import { workspaceSchema, type Workspace } from "../domain/schemas";
import { seedWorkspace } from "./seed";
import { STORAGE_KEY } from "./local-repository";
import type { WorkspaceRepository } from "./repository";
import { getAccessToken } from "../supabase/auth";
import { getSupabaseConfig } from "../supabase/config";

type WorkspaceStateRow = {
  revision: number | string;
  selected_business_id: string | null;
};

type BusinessRow = {
  id: string;
  number: number;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  business_id: string;
  profile: unknown;
};

type PayloadRow = { payload: unknown };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Authentication required.");
  const { url, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Supabase request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as Record<string, unknown>;
      if (typeof payload.message === "string") message = payload.message;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function normalizeTimestamp(value: string): string {
  const candidate = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    .replace(/([+-]\d{2})$/, "$1:00");
  const timestamp = new Date(candidate);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Workspace contains an invalid timestamp.");
  }
  return timestamp.toISOString();
}

function localWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = workspaceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  private revision = 0;

  async load(): Promise<Workspace> {
    const [states, businesses, profiles, strategies, content, campaigns, creatives, metrics, activity] =
      await Promise.all([
        request<WorkspaceStateRow[]>("/workspace_state?select=revision,selected_business_id&limit=1"),
        request<BusinessRow[]>("/businesses?select=id,number,created_at,updated_at&order=number.asc"),
        request<ProfileRow[]>("/business_profiles?select=business_id,profile"),
        request<PayloadRow[]>("/strategies?select=payload"),
        request<PayloadRow[]>("/content_items?select=payload"),
        request<PayloadRow[]>("/campaigns?select=payload"),
        request<PayloadRow[]>("/creatives?select=payload"),
        request<PayloadRow[]>("/performance_metrics?select=payload"),
        request<PayloadRow[]>("/activity?select=payload"),
      ]);

    const state = states[0];
    if (!state || businesses.length === 0) {
      const initial = localWorkspace() ?? seedWorkspace();
      this.revision = 0;
      await this.save(initial);
      localStorage.removeItem(STORAGE_KEY);
      return initial;
    }

    this.revision = Number(state.revision);
    if (!Number.isSafeInteger(this.revision) || this.revision < 0) {
      throw new Error("Workspace revision is invalid.");
    }

    const profileByBusiness = new Map(
      profiles.map((row) => [row.business_id, row.profile]),
    );
    const assembled = {
      version: 1 as const,
      selectedBusinessId:
        state.selected_business_id ?? businesses[0]?.id ?? "",
      businesses: businesses.map((row) => ({
        id: row.id,
        number: row.number,
        profile: profileByBusiness.get(row.id),
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
      })),
      strategies: strategies.map((row) => row.payload),
      content: content.map((row) => row.payload),
      campaigns: campaigns.map((row) => row.payload),
      creatives: creatives.map((row) => row.payload),
      metrics: metrics.map((row) => row.payload),
      activity: activity
        .map((row) => row.payload)
        .sort((a, b) => {
          const left =
            a && typeof a === "object" && "at" in a
              ? String((a as Record<string, unknown>).at)
              : "";
          const right =
            b && typeof b === "object" && "at" in b
              ? String((b as Record<string, unknown>).at)
              : "";
          return right.localeCompare(left);
        }),
    };

    return workspaceSchema.parse(assembled);
  }

  async save(workspace: Workspace): Promise<void> {
    const parsed = workspaceSchema.parse(workspace);
    try {
      const result = await request<{ revision: number | string }>(
        "/rpc/save_workspace",
        {
          method: "POST",
          body: JSON.stringify({
            p_workspace: parsed,
            p_expected_revision: this.revision,
          }),
        },
      );
      const nextRevision = Number(result.revision);
      if (!Number.isSafeInteger(nextRevision) || nextRevision <= this.revision) {
        throw new Error("Supabase returned an invalid workspace revision.");
      }
      this.revision = nextRevision;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("workspace_conflict")
      ) {
        throw new Error(
          "This workspace changed in another session. Reload before saving again.",
        );
      }
      throw error;
    }
  }
}

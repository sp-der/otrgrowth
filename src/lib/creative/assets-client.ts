"use client";

import { engineDB } from "../engine-client";
import { getAccessToken, getCurrentUser } from "../supabase/auth";
import { getSupabaseConfig } from "../supabase/config";
import {
  creativeAssetRowSchema,
  sourceAssetSchema,
  type CreativeAssetRow,
  type SourceAsset,
} from "./schemas";

export function sourceAssetFromRow(row: CreativeAssetRow): SourceAsset {
  return sourceAssetSchema.parse({
    id: row.id,
    label: row.label,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
  });
}

export async function listCreativeAssets(businessId: string) {
  return creativeAssetRowSchema.array().parse(
    await engineDB(
      "/creative_assets?business_id=eq." +
        encodeURIComponent(businessId) +
        "&select=id,business_id,kind,label,storage_path,mime_type,width,height,duration_seconds,created_at&order=created_at.desc",
    ),
  );
}

function extensionFor(file: File) {
  const byMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
  };
  const extension = byMime[file.type];
  if (!extension) throw new Error("Unsupported creative asset file type.");
  return extension;
}

export async function uploadCreativeAsset(
  businessId: string,
  file: File,
  kind: CreativeAssetRow["kind"],
) {
  const user = await getCurrentUser();
  const token = await getAccessToken();
  if (!user || !token) throw new Error("Sign in to upload assets.");
  if ((kind === "image" || kind === "logo") && !file.type.startsWith("image/")) {
    throw new Error("Image and logo assets require an image file.");
  }
  if (kind === "video" && !file.type.startsWith("video/")) {
    throw new Error("Video assets require a video file.");
  }
  if (kind === "audio" && !file.type.startsWith("audio/")) {
    throw new Error("Audio assets require an audio file.");
  }

  const id = crypto.randomUUID();
  const extension = extensionFor(file);
  const storagePath =
    user.id + "/" + businessId + "/" + id + "." + extension;
  const inserted = creativeAssetRowSchema.array().parse(
    await engineDB("/creative_assets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id,
        business_id: businessId,
        kind,
        label: file.name.slice(0, 200),
        storage_path: storagePath,
        mime_type: file.type,
      }),
    }),
  );

  const { url, publishableKey } = getSupabaseConfig();
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const uploaded = await fetch(
    url + "/storage/v1/object/creative-assets/" + encodedPath,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + token,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: file,
    },
  );
  if (!uploaded.ok) {
    throw new Error("Asset metadata was saved, but the file upload failed.");
  }
  return inserted[0];
}

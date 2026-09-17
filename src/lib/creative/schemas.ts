import { z } from "zod";
export const templates = [
  "Product Promo",
  "Service Promo",
  "Offer / Sale",
  "Website Showcase",
  "Testimonial",
  "Announcement",
] as const;
export const platforms = [
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "Generic",
] as const;
const copy = z.string().trim().min(1).max(600);
export const creativeDNASchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#181426"),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#a78bfa"),
  headingFont: z.enum(["Arial", "Georgia", "Verdana"]).default("Arial"),
  bodyFont: z.enum(["Arial", "Georgia", "Verdana"]).default("Arial"),
  pacing: z.enum(["Calm", "Balanced", "Fast"]).default("Balanced"),
  wordsToAvoid: z.string().max(1000).default(""),
});
export type CreativeDNA = z.infer<typeof creativeDNASchema>;
// Local asset keys only; renderer never fetches user-supplied URLs.
export const sourceAssetSchema = z.object({
  id: z.uuid(),
  label: z.string().max(200),
  kind: z.enum(["image", "video"]),
  storagePath: z.string().regex(/^[a-zA-Z0-9_/-]+\.(png|jpg|webp|mp4)$/),
});
export const briefSchema = z.object({
  platform: z.enum(platforms),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  durationSeconds: z.number().int().min(3).max(60),
  template: z.enum(templates),
  hook: copy,
  bodyCopy: copy,
  cta: copy,
  scenes: z
    .array(z.object({ text: copy }))
    .min(1)
    .max(8),
  sourceAssets: z.array(sourceAssetSchema).max(20).default([]),
  recommendationId: z.uuid().optional(),
});
export type CreativeBrief = z.infer<typeof briefSchema>;
export const compositionSchema = z.object({
  version: z.literal(1),
  brand: z.string().min(1).max(200),
  dna: creativeDNASchema,
  brief: briefSchema,
});
export type Composition = z.infer<typeof compositionSchema>;
export const studioSchema = z.object({
  brief: briefSchema,
  composition: compositionSchema,
  approval: z
    .enum(["Draft", "In review", "Approved", "Rejected"])
    .default("Draft"),
  previousVersionId: z.uuid().optional(),
});
export const renderStatusSchema = z.enum([
  "queued",
  "rendering",
  "completed",
  "failed",
]);
export const renderJobSchema = z.object({
  id: z.uuid(),
  creative_id: z.uuid(),
  business_id: z.uuid(),
  status: renderStatusSchema,
  output_path: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
});
export type RenderJob = z.infer<typeof renderJobSchema>;

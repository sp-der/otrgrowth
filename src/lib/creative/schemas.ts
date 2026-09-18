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

export const sceneTypes = [
  "hook",
  "product",
  "service",
  "gallery",
  "testimonial",
  "feature",
  "offer",
  "social-proof",
  "announcement",
  "cta",
  "end-card",
] as const;

export const animationPresets = [
  "fade-up",
  "fade-in",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "subtle-pan",
  "reveal",
  "pop-in",
  "end-card-focus",
] as const;

export const transitionPresets = [
  "cut",
  "crossfade",
  "fade-through",
  "slide",
  "zoom",
  "blur-fade",
] as const;

const copy = z.string().trim().max(600);
const shortCopy = z.string().trim().max(240);

export const creativeDNASchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#181426"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#a78bfa"),
  headingFont: z
    .enum(["Arial", "Georgia", "Verdana", "Helvetica", "Trebuchet MS", "Impact"])
    .default("Arial"),
  bodyFont: z
    .enum(["Arial", "Georgia", "Verdana", "Helvetica", "Trebuchet MS"])
    .default("Arial"),
  pacing: z.enum(["Calm", "Balanced", "Fast"]).default("Balanced"),
  visualStyle: z
    .enum(["Clean", "Bold", "Luxury", "Editorial", "Playful", "Minimal"])
    .default("Clean"),
  brandMood: z.string().trim().max(300).default(""),
  transitionStyle: z
    .enum(["Clean", "Punchy", "Cinematic", "Soft"])
    .default("Clean"),
  motionIntensity: z.enum(["Subtle", "Balanced", "High"]).default("Balanced"),
  preferredTextStyle: z.string().trim().max(300).default(""),
  ctaStyle: z
    .enum(["Button", "Minimal", "Bold", "Editorial"])
    .default("Button"),
  logoTreatment: z
    .enum(["Corner", "Center", "End card only", "Watermark"])
    .default("Corner"),
  musicVibe: z.string().trim().max(300).default(""),
  footageStyle: z.string().trim().max(300).default(""),
  referenceAdNotes: z.string().trim().max(1000).default(""),
  wordsToFavor: z.string().max(1000).default(""),
  wordsToAvoid: z.string().max(1000).default(""),
});
export type CreativeDNA = z.infer<typeof creativeDNASchema>;

export const sourceAssetSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(["image", "video", "logo", "audio"]),
  storagePath: z
    .string()
    .regex(/^[a-zA-Z0-9_/-]+\.(png|jpg|jpeg|webp|mp4|webm|mp3|wav|m4a|ogg)$/),
  mimeType: z.string().max(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
});
export type SourceAsset = z.infer<typeof sourceAssetSchema>;

export const creativeAssetRowSchema = z.object({
  id: z.uuid(),
  business_id: z.uuid(),
  kind: z.enum(["image", "video", "logo", "audio"]),
  label: z.string().trim().min(1).max(200),
  storage_path: z.string(),
  mime_type: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  duration_seconds: z.coerce.number().positive().nullable(),
  created_at: z.string(),
});
export type CreativeAssetRow = z.infer<typeof creativeAssetRowSchema>;

export const sceneSchema = z.object({
  id: z.uuid().default(() => crypto.randomUUID()),
  type: z.enum(sceneTypes).default("feature"),
  durationSeconds: z.number().min(0.75).max(30).default(3),
  text: copy.default(""),
  subtext: copy.default(""),
  cta: shortCopy.default(""),
  mediaAssetIds: z.array(z.uuid()).max(6).default([]),
  backgroundAssetId: z.uuid().optional(),
  logoEnabled: z.boolean().default(false),
  textPosition: z
    .enum(["top", "center", "bottom", "left", "right"])
    .default("center"),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  overlayOpacity: z.number().min(0).max(0.85).default(0.34),
  animationPreset: z.enum(animationPresets).default("fade-up"),
  transitionIn: z.enum(transitionPresets).default("crossfade"),
  transitionOut: z.enum(transitionPresets).default("crossfade"),
  emphasis: z.enum(["quiet", "standard", "strong"]).default("standard"),
  captionEnabled: z.boolean().default(true),
});
export type CreativeScene = z.infer<typeof sceneSchema>;

export const audioSchema = z.object({
  musicAssetId: z.uuid().optional(),
  voiceoverAssetId: z.uuid().optional(),
  musicVolume: z.number().min(0).max(1).default(0.24),
  voiceoverVolume: z.number().min(0).max(1).default(1),
  fadeIn: z.number().min(0).max(3).default(0.35),
  fadeOut: z.number().min(0).max(3).default(0.7),
});
export type CreativeAudio = z.infer<typeof audioSchema>;

export const motionSettingsSchema = z.object({
  pacing: z.enum(["Calm", "Balanced", "Fast"]).default("Balanced"),
  transitionStyle: z
    .enum(["Clean", "Punchy", "Cinematic", "Soft"])
    .default("Clean"),
  visualStyle: z
    .enum(["Clean", "Bold", "Luxury", "Editorial", "Playful", "Minimal"])
    .default("Clean"),
  motionIntensity: z.enum(["Subtle", "Balanced", "High"]).default("Balanced"),
});

export const briefSchema = z.object({
  platform: z.enum(platforms),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  durationSeconds: z.number().int().min(3).max(60),
  template: z.enum(templates),
  hook: copy.min(1),
  bodyCopy: copy.min(1),
  cta: copy.min(1),
  scenes: z.array(sceneSchema).min(1).max(12),
  sourceAssets: z.array(sourceAssetSchema).max(50).default([]),
  audio: audioSchema.default({}),
  motion: motionSettingsSchema.default({}),
  recommendationId: z.uuid().optional(),
});
export type CreativeBrief = z.infer<typeof briefSchema>;

export const compositionV1Schema = z.object({
  version: z.literal(1),
  brand: z.string().min(1).max(200),
  dna: creativeDNASchema,
  brief: briefSchema,
});

export const compositionV2Schema = z.object({
  version: z.literal(2),
  brand: z.string().min(1).max(200),
  dna: creativeDNASchema,
  brief: briefSchema,
});

export const compositionSchema = z.discriminatedUnion("version", [
  compositionV1Schema,
  compositionV2Schema,
]);
export type Composition = z.infer<typeof compositionSchema>;

export function upgradeBrief(input: unknown): CreativeBrief {
  return briefSchema.parse(input);
}

export function fitSceneDurations(
  scenes: CreativeScene[],
  targetSeconds: number,
): CreativeScene[] {
  const parsed = sceneSchema.array().parse(scenes);
  const total = parsed.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  if (!total) return parsed;
  const scale = targetSeconds / total;
  const scaled = parsed.map((scene) => ({
    ...scene,
    durationSeconds: Math.max(0.75, Number((scene.durationSeconds * scale).toFixed(2))),
  }));
  const current = scaled.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const delta = Number((targetSeconds - current).toFixed(2));
  const last = scaled.at(-1);
  if (last && last.durationSeconds + delta >= 0.75) {
    last.durationSeconds = Number((last.durationSeconds + delta).toFixed(2));
  }
  return scaled;
}

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

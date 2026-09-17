import { z } from "zod";
import { creativeDNASchema, studioSchema } from "../creative/schemas";

const text = z.string().trim().max(5000);
const short = z.string().trim().max(200);
const web = z.union([
  z.literal(""),
  z.url().refine((v) => /^https?:\/\//i.test(v), "Use an http or https URL"),
]);
export const businessProfileSchema = z.object({
  creativeDNA: creativeDNASchema.optional(),
  businessName: short.min(1, "Business name is required"),
  industry: short,
  description: text,
  services: text,
  location: short,
  website: web,
  instagram: short,
  facebook: short,
  tiktok: short,
  targetCustomer: text,
  customerProblem: text,
  usp: text,
  brandVoice: text,
  brandPersonality: text,
  brandStyle: text,
  primaryGoal: text,
  secondaryGoals: text,
  typicalOffer: text,
  averageCustomerValue: z.union([
    z.literal(""),
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount, or leave blank"),
  ]),
  competitors: text,
  additionalContext: text,
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
export const businessSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  profile: businessProfileSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Business = z.infer<typeof businessSchema>;
const bullets = z.array(z.string().trim().min(1).max(3000)).min(1).max(12);
export const strategySchema = z.object({
  executiveSummary: z.string().trim().min(1).max(6000),
  idealCustomerProfiles: z
    .array(
      z.object({
        name: short.min(1),
        description: text.min(1),
        painPoints: bullets,
      }),
    )
    .min(1)
    .max(5),
  positioning: text.min(1),
  offerRecommendations: bullets,
  contentPillars: z
    .array(
      z.object({ name: short.min(1), purpose: text.min(1), ideas: bullets }),
    )
    .min(1)
    .max(6),
  channelRecommendations: z
    .array(
      z.object({
        channel: short.min(1),
        rationale: text.min(1),
        cadence: short.min(1),
      }),
    )
    .min(1)
    .max(6),
  campaignConcepts: z
    .array(
      z.object({
        name: short.min(1),
        objective: text.min(1),
        concept: text.min(1),
        callToAction: text.min(1),
      }),
    )
    .min(1)
    .max(5),
  thirtyDayPriorities: z
    .array(z.object({ week: z.number().int().min(1).max(4), actions: bullets }))
    .length(4)
    .refine(
      (items) => new Set(items.map((i) => i.week)).size === 4,
      "Include weeks 1 through 4",
    ),
  keyMetrics: z
    .array(
      z.object({
        name: short.min(1),
        reason: text.min(1),
        measurement: text.min(1),
      }),
    )
    .min(1)
    .max(12),
});
export type Strategy = z.infer<typeof strategySchema>;
export const contentStatusSchema = z.enum([
  "Idea",
  "Draft",
  "In review",
  "Approved",
]);
export const contentItemSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  title: short.min(1),
  kind: z.enum(["Idea", "Caption", "Reel"]),
  channel: short.min(1),
  body: text,
  status: contentStatusSchema,
  scheduledFor: z.union([z.literal(""), z.iso.date()]),
});
export type ContentItem = z.infer<typeof contentItemSchema>;
export const campaignSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  name: short.min(1),
  objective: text,
  audience: text,
  offer: text,
  channel: short,
  adCopy: text,
  creativeStatus: z.enum(["Concept", "In production", "Ready"]),
  status: z.enum([
    "Draft",
    "In review",
    "Ready",
    "Active",
    "Paused",
    "Completed",
  ]),
});
export type Campaign = z.infer<typeof campaignSchema>;
export const creativeSchema = z.object({
  studio: studioSchema.optional(),
  id: z.uuid(),
  businessId: z.uuid(),
  campaignId: z.uuid(),
  title: short.min(1),
  concept: text,
  format: z.enum(["Image", "Video", "Carousel"]),
  status: z.enum(["Concept", "In production", "Ready"]),
});
export type Creative = z.infer<typeof creativeSchema>;
export const performanceMetricSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  source: z.enum(["demo", "meta", "google", "tiktok", "manual"]),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(),
  customers: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
});
export type PerformanceMetric = z.infer<typeof performanceMetricSchema>;
export const savedStrategySchema = z.object({
  businessId: z.uuid(),
  profileSnapshot: businessProfileSchema,
  generatedAt: z.iso.datetime(),
  strategy: strategySchema,
});
export const workspaceSchema = z.object({
  version: z.literal(1),
  selectedBusinessId: z.uuid(),
  businesses: z.array(businessSchema).min(1),
  content: z.array(contentItemSchema),
  campaigns: z.array(campaignSchema),
  creatives: z.array(creativeSchema),
  metrics: z.array(performanceMetricSchema),
  strategies: z.array(savedStrategySchema),
  activity: z
    .array(
      z.object({
        id: z.uuid(),
        businessId: z.uuid(),
        title: short,
        at: z.iso.datetime(),
      }),
    )
    .max(100),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const profileSections: {
  title: string;
  description: string;
  fields: {
    key: Exclude<keyof BusinessProfile, "creativeDNA">;
    label: string;
    multiline?: boolean;
    placeholder?: string;
  }[];
}[] = [
  {
    title: "The business",
    description: "Start with what you do and where you do it.",
    fields: [
      { key: "businessName", label: "Business name" },
      { key: "industry", label: "Industry" },
      { key: "description", label: "Description", multiline: true },
      { key: "services", label: "Products / services", multiline: true },
      { key: "location", label: "Service area / location" },
      {
        key: "website",
        label: "Website",
        placeholder: "https://yourbusiness.com",
      },
      { key: "instagram", label: "Instagram" },
      { key: "facebook", label: "Facebook" },
      { key: "tiktok", label: "TikTok" },
    ],
  },
  {
    title: "Your people & your edge",
    description: "Give your strategy a clear point of view.",
    fields: [
      { key: "targetCustomer", label: "Target customer", multiline: true },
      {
        key: "customerProblem",
        label: "Primary customer problem",
        multiline: true,
      },
      { key: "usp", label: "Unique selling proposition", multiline: true },
      { key: "competitors", label: "Competitors", multiline: true },
    ],
  },
  {
    title: "Brand character",
    description: "Keep every idea recognizably yours.",
    fields: [
      { key: "brandVoice", label: "Brand voice", multiline: true },
      { key: "brandPersonality", label: "Brand personality", multiline: true },
      { key: "brandStyle", label: "Brand colors / style", multiline: true },
    ],
  },
  {
    title: "Goals & offers",
    description: "Unknown details can stay blank. Never guess financials.",
    fields: [
      { key: "primaryGoal", label: "Primary marketing goal", multiline: true },
      { key: "secondaryGoals", label: "Secondary goals", multiline: true },
      { key: "typicalOffer", label: "Typical offer", multiline: true },
      {
        key: "averageCustomerValue",
        label: "Average customer value (USD)",
        placeholder: "Not provided",
      },
      {
        key: "additionalContext",
        label: "Additional context",
        multiline: true,
      },
    ],
  },
];

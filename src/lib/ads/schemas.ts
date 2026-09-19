import { z } from "zod";
import { performanceMetricSchema } from "../domain/schemas";
export const evidenceKeys = [
  "trackingVerified",
  "creativeFatigueObserved",
  "budgetOnPace",
  "audienceVerified",
  "landingPageVerified",
  "performanceOnTarget",
] as const;
export const evidenceLabels = [
  "Tracking verified",
  "Creative fatigue observed",
  "Budget on pace",
  "Audience verified",
  "Landing page verified",
  "Performance on target",
];
export const evidenceSchema = z
  .object({
    trackingVerified: z.boolean().nullable().optional(),
    creativeFatigueObserved: z.boolean().nullable().optional(),
    budgetOnPace: z.boolean().nullable().optional(),
    audienceVerified: z.boolean().nullable().optional(),
    landingPageVerified: z.boolean().nullable().optional(),
    performanceOnTarget: z.boolean().nullable().optional(),
    note: z.string().max(1000).default(""),
  })
  .strict();
const evidence = z.array(z.record(z.string(), z.unknown())).max(100);
export const recommendationSchema = z.object({
  id: z.uuid(),
  title: z.string().max(300),
  description: z.string().max(5000),
  category: z.string().max(100),
  severity: z.enum(["high", "medium"]),
  confidence: z.literal("medium"),
  evidence,
  businessId: z.uuid(),
  campaignId: z.uuid().nullable(),
  proposedAction: z.enum(["refresh_creative", "review_evidence"]),
  requiresApproval: z.literal(true),
  status: z.literal("Suggested"),
});
export type Recommendation = z.infer<typeof recommendationSchema>;
export const auditReportSchema = z.object({
  schemaVersion: z.literal(1),
  metricContext: performanceMetricSchema
    .omit({ id: true, businessId: true })
    .nullable()
    .default(null),
  status: z.enum(["normal", "provisional", "insufficient_evidence"]),
  healthScore: z.number().min(0).max(100).nullable(),
  evidenceCoverage: z.number().min(0).max(100),
  findings: z
    .array(
      z.object({
        control_id: z.string(),
        category: z.string(),
        status: z.enum(["pass", "fail", "unknown"]),
        severity: z.enum(["high", "medium"]),
        confidence: z.enum(["medium", "none"]),
        observation: z.string(),
        evidence,
      }),
    )
    .max(100),
  recommendations: z.array(recommendationSchema).max(100),
  dataGaps: z.array(z.string()),
  sources: z.array(z.string()),
  externalExecutionEnabled: z.literal(false),
});
export type AuditReport = z.infer<typeof auditReportSchema>;

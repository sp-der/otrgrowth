import { strategySchema } from "../../domain/schemas";
import { AIError } from "../types";
export function parseStrategyResponse(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return strategySchema.parse(JSON.parse(cleaned));
  } catch {
    throw new AIError(
      "MALFORMED_RESPONSE",
      "The model returned an incomplete or invalid strategy. Nothing was overwritten. Try again or choose a different AI_MODEL.",
      502,
    );
  }
}

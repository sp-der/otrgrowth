import "server-only";
import { businessProfileSchema, type BusinessProfile } from "../domain/schemas";
import { getAIProvider } from "./provider";
import { strategyMessages } from "./prompts/strategy";
import { parseStrategyResponse } from "./schemas/strategy-response";
import type { AIProvider } from "./types";
export async function generateStrategy(
  profile: BusinessProfile,
  provider: AIProvider = getAIProvider(),
) {
  const validated = businessProfileSchema.parse(profile);
  return parseStrategyResponse(
    await provider.complete(strategyMessages(validated)),
  );
}

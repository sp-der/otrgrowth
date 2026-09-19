import "server-only";
import { z } from "zod";
import { AIError, type AIMessage, type AIProvider } from "./types";
import { readLimited } from "./read-limited";
const envelopeSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
    .min(1),
});
export type ProviderConfig = { baseUrl: string; apiKey: string; model: string };
export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private config: ProviderConfig,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 45_000,
    private maxTokens = 6_000,
  ) {}
  async complete(messages: AIMessage[]): Promise<string> {
    const { baseUrl, apiKey, model } = this.config;
    if (!apiKey.trim())
      throw new AIError(
        "GATEWAY_NOT_CONFIGURED",
        "The AI Gateway is not configured for this deployment.",
      );
    let endpoint: URL;
    try {
      endpoint = new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`);
      if (
        !["http:", "https:"].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error();
      if (
        endpoint.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
      )
        throw new Error();
    } catch {
      throw new AIError(
        "GATEWAY_NOT_CONFIGURED",
        "The AI Gateway URL is invalid. Use HTTP on loopback for local development, or HTTPS for a remote provider.",
      );
    }
    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          response_format: { type: "json_object" },
          max_tokens: this.maxTokens,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status))
          throw new AIError(
            "GATEWAY_NOT_CONFIGURED",
            "The AI Gateway rejected its credentials. Verify the configured provider or Vercel OIDC access.",
          );
        throw new AIError(
          "PROVIDER_UNAVAILABLE",
          "The AI Gateway is unavailable or rate-limited. Confirm it is running and has a working upstream provider, then retry.",
        );
      }
      let envelope;
      try {
        envelope = envelopeSchema.safeParse(
          JSON.parse(await readLimited(response.body, 256_000)),
        );
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof RangeError)
          throw new AIError(
            "MALFORMED_RESPONSE",
            "The AI Gateway returned an unreadable response. Try generating again or select a different model.",
            502,
          );
        throw error;
      }
      if (!envelope.success)
        throw new AIError(
          "MALFORMED_RESPONSE",
          "The AI Gateway returned no usable strategy content. Try again or select a different model.",
          502,
        );
      return envelope.data.choices[0].message.content;
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError(
        "PROVIDER_UNAVAILABLE",
        "The AI Gateway could not be reached or timed out. Start the separate gateway, verify the server configuration, and retry.",
      );
    }
  }
}
export function getAIProvider(options: { timeoutMs?: number; maxTokens?: number } = {}): AIProvider {
  const explicitKey = process.env.AI_API_KEY?.trim() || "";
  const vercelOidc = process.env.VERCEL_OIDC_TOKEN?.trim() || "";
  const useVercelGateway = !explicitKey && Boolean(vercelOidc);

  return new OpenAICompatibleProvider(
    {
      baseUrl:
        process.env.AI_BASE_URL ||
        (useVercelGateway
          ? "https://ai-gateway.vercel.sh/v1"
          : "http://127.0.0.1:3001/v1"),
      apiKey: explicitKey || vercelOidc,
      model:
        process.env.AI_MODEL ||
        (useVercelGateway ? "openai/gpt-5.6-sol" : "auto:smart"),
    },
    fetch,
    options.timeoutMs ?? 45_000,
    options.maxTokens ?? 6_000,
  );
}

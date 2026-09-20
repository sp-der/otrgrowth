import "server-only";
import { z } from "zod";
import { AIError, type AIMessage, type AIProvider } from "./types";
import { readLimited } from "./read-limited";
import { getVercelRuntimeOidcToken } from "./vercel-oidc";
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
        "The AI Gateway must be configured for this deployment.",
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
        let gatewayType = "";
        try {
          const raw = await readLimited(response.body, 32_000);
          const parsed = JSON.parse(raw) as {
            error?: { type?: unknown; message?: unknown };
          };
          gatewayType =
            typeof parsed.error?.type === "string" ? parsed.error.type : "";
        } catch {
          // Keep user-facing errors deterministic even when the gateway body is absent.
        }

        if (response.status === 402) {
          throw new AIError(
            "GATEWAY_PAYMENT_REQUIRED",
            gatewayType === "quota_for_entity_exceeded"
              ? "Vercel AI Gateway budget is exhausted. Increase the team/project budget, then retry."
              : "Vercel AI Gateway has no available credits. Add credits or a payment method, then retry.",
            402,
          );
        }
        if (response.status === 401) {
          throw new AIError(
            "GATEWAY_NOT_CONFIGURED",
            "Vercel AI Gateway rejected authentication. Add AI_GATEWAY_API_KEY to the Vercel project or verify OIDC federation is enabled.",
            401,
          );
        }
        if (response.status === 403) {
          throw new AIError(
            "GATEWAY_ACCESS_DENIED",
            "Vercel AI Gateway denied this project. Enable Secure Backend Access with OIDC Federation or use AI_GATEWAY_API_KEY.",
            403,
          );
        }
        if (response.status === 429) {
          throw new AIError(
            "PROVIDER_UNAVAILABLE",
            "Vercel AI Gateway is rate-limited. Wait briefly and retry.",
            429,
          );
        }
        throw new AIError(
          "PROVIDER_UNAVAILABLE",
          "The AI Gateway is unavailable. Verify the model and provider configuration, then retry.",
          502,
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
  const customKey = process.env.AI_API_KEY?.trim() || "";
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim() || "";
  const vercelOidc = getVercelRuntimeOidcToken();
  const useVercelGateway = Boolean(gatewayKey || (!customKey && vercelOidc));
  const apiKey = customKey || gatewayKey || vercelOidc;

  return new OpenAICompatibleProvider(
    {
      baseUrl:
        process.env.AI_BASE_URL ||
        (useVercelGateway
          ? "https://ai-gateway.vercel.sh/v1"
          : "http://127.0.0.1:3001/v1"),
      apiKey,
      model:
        process.env.AI_MODEL ||
        (useVercelGateway ? "openai/gpt-5.6-sol" : "auto:smart"),
    },
    fetch,
    options.timeoutMs ?? 45_000,
    options.maxTokens ?? 6_000,
  );
}

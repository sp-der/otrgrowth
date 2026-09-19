import "server-only";
import { z } from "zod";
import { AIError, type AIMessage, type AIProvider } from "./types";
import { readLimited } from "./read-limited";
import { getVercelGatewayOidcHeaders, getVercelRuntimeOidcToken } from "./vercel-oidc";
const envelopeSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
    .min(1),
});
const vercelGatewayEnvelopeSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough(),
  ),
}).passthrough();

export class VercelGatewayProvider implements AIProvider {
  constructor(
    private token: string,
    private model: string,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 45_000,
    private maxTokens = 6_000,
  ) {}

  async complete(messages: AIMessage[]): Promise<string> {
    if (!this.token.trim()) {
      throw new AIError(
        "GATEWAY_NOT_CONFIGURED",
        "The AI Gateway must be configured for this deployment.",
      );
    }

    const prompt = messages.map((message) =>
      message.role === "system"
        ? { role: "system" as const, content: message.content }
        : {
            role: "user" as const,
            content: [{ type: "text" as const, text: message.content }],
          },
    );

    try {
      const response = await this.fetcher(
        "https://ai-gateway.vercel.sh/v4/ai/language-model",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getVercelGatewayOidcHeaders(this.token),
            "ai-language-model-specification-version": "4",
            "ai-language-model-id": this.model,
            "ai-language-model-streaming": "false",
          },
          body: JSON.stringify({
            prompt,
            maxOutputTokens: this.maxTokens,
            responseFormat: { type: "json" },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
          redirect: "error",
        },
      );

      if (!response.ok) {
        let detail = "";
        try {
          detail = (await readLimited(response.body, 16_000)).slice(0, 1_000);
        } catch {
          await response.body?.cancel();
        }

        if ([401, 403].includes(response.status)) {
          throw new AIError(
            "GATEWAY_NOT_CONFIGURED",
            detail
              ? `Vercel AI Gateway rejected the generation request (${response.status}): ${detail}`
              : `Vercel AI Gateway rejected the generation request (${response.status}).`,
          );
        }

        throw new AIError(
          "PROVIDER_UNAVAILABLE",
          detail
            ? `Vercel AI Gateway returned ${response.status}: ${detail}`
            : `Vercel AI Gateway returned ${response.status}.`,
        );
      }

      let parsed;
      try {
        parsed = vercelGatewayEnvelopeSchema.safeParse(
          JSON.parse(await readLimited(response.body, 256_000)),
        );
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof RangeError) {
          throw new AIError(
            "MALFORMED_RESPONSE",
            "Vercel AI Gateway returned an unreadable response.",
            502,
          );
        }
        throw error;
      }

      if (!parsed.success) {
        throw new AIError(
          "MALFORMED_RESPONSE",
          "Vercel AI Gateway returned no usable generation content.",
          502,
        );
      }

      const text = parsed.data.content
        .filter(
          (part): part is typeof part & { type: "text"; text: string } =>
            part.type === "text" && typeof part.text === "string",
        )
        .map((part) => part.text)
        .join("");

      if (!text.trim()) {
        throw new AIError(
          "MALFORMED_RESPONSE",
          "Vercel AI Gateway returned an empty generation.",
          502,
        );
      }

      return text;
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError(
        "PROVIDER_UNAVAILABLE",
        "Vercel AI Gateway could not be reached or timed out.",
      );
    }
  }
}

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
  const vercelOidc = getVercelRuntimeOidcToken();
  const model = process.env.AI_MODEL || "openai/gpt-5.6-sol";

  if (!explicitKey && vercelOidc) {
    return new VercelGatewayProvider(
      vercelOidc,
      model,
      fetch,
      options.timeoutMs ?? 45_000,
      options.maxTokens ?? 6_000,
    );
  }

  return new OpenAICompatibleProvider(
    {
      baseUrl: process.env.AI_BASE_URL || "http://127.0.0.1:3001/v1",
      apiKey: explicitKey,
      model: process.env.AI_MODEL || "auto:smart",
    },
    fetch,
    options.timeoutMs ?? 45_000,
    options.maxTokens ?? 6_000,
  );
}

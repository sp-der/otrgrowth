export type AIMessage = { role: "system" | "user"; content: string };
export interface AIProvider {
  complete(messages: AIMessage[]): Promise<string>;
}
export type AIErrorCode =
  "GATEWAY_NOT_CONFIGURED" | "PROVIDER_UNAVAILABLE" | "MALFORMED_RESPONSE";
export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
    public status = 503,
  ) {
    super(message);
    this.name = "AIError";
  }
}

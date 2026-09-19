import "server-only";

type VercelRequestContext = {
  headers?: Record<string, string>;
};

const REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context");

export function getVercelRuntimeOidcToken() {
  const runtime = globalThis as typeof globalThis & {
    [REQUEST_CONTEXT_SYMBOL]?: { get?: () => VercelRequestContext };
  };

  return (
    runtime[REQUEST_CONTEXT_SYMBOL]?.get?.().headers?.[
      "x-vercel-oidc-token"
    ]?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    ""
  );
}

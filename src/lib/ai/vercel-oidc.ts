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

export function getVercelGatewayOidcHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "ai-gateway-auth-method": "oidc",
    "ai-gateway-protocol-version": "0.0.1",
  };
}

export async function probeVercelGatewayOidc(token: string) {
  if (!token) return false;
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/credits", {
      method: "GET",
      headers: getVercelGatewayOidcHeaders(token),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

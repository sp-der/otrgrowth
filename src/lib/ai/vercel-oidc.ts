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

export async function inspectVercelGatewayOidc(token: string, model: string) {
  if (!token) {
    return {
      authenticated: false,
      modelAvailable: false,
      creditsStatus: 0,
      configStatus: 0,
    };
  }

  try {
    const headers = getVercelGatewayOidcHeaders(token);
    const [creditsResponse, configResponse] = await Promise.all([
      fetch("https://ai-gateway.vercel.sh/v1/credits", {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      }),
      fetch("https://ai-gateway.vercel.sh/v4/ai/config", {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      }),
    ]);

    let modelAvailable = false;
    if (configResponse.ok) {
      try {
        const payload = (await configResponse.json()) as {
          models?: Array<{ id?: string }>;
        };
        modelAvailable = Boolean(
          payload.models?.some((entry) => entry.id === model),
        );
      } catch {
        modelAvailable = false;
      }
    } else {
      await configResponse.body?.cancel();
    }

    await creditsResponse.body?.cancel();

    return {
      authenticated: creditsResponse.ok && configResponse.ok,
      modelAvailable,
      creditsStatus: creditsResponse.status,
      configStatus: configResponse.status,
    };
  } catch {
    return {
      authenticated: false,
      modelAvailable: false,
      creditsStatus: 0,
      configStatus: 0,
    };
  }
}

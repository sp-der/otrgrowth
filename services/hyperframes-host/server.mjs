import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import {
  createReadStream,
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, join } from "node:path";
import {
  generatedDeliveryPath,
  installGeneratedProject,
  renderGeneratedProject,
  storeGeneratedVideoAsset,
} from "./generator.mjs";

const PORT = Number(process.env.PORT || 8080);
const PROJECTS_DIR = resolve(process.env.HYPERFRAMES_PROJECTS_DIR || "/data/projects");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const COOKIE = "otr_hf_session";
const CLI = resolve(process.cwd(), "node_modules/.bin/hyperframes");
const sessions = new Map();
const pending = new Map();
const authCache = new Map();
const SMOKE_DIR = "/tmp/otr-hyperframes-official-smoke";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
}
mkdirSync(PROJECTS_DIR, { recursive: true });

function parseCookies(header = "") {
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function readBearer(request) {
  const value = String(request.headers.authorization || "").trim();
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function readJsonBody(request, maxBytes = 4_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readBinaryBody(request, maxBytes = 25_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function readSession(request) {
  const raw = parseCookies(request.headers.cookie || "")[COOKIE];
  if (!raw) throw new Error("studio_session_missing");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("studio_session_invalid");
  }
  if (
    !payload ||
    typeof payload.accessToken !== "string" ||
    typeof payload.businessId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payload.businessId)
  ) {
    throw new Error("studio_session_invalid");
  }
  return payload;
}

async function supabase(path, token) {
  return fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
}

async function authorize(payload) {
  const key = `${payload.businessId}:${payload.accessToken.slice(-24)}`;
  const cached = authCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.context;

  const businessQuery =
    `/rest/v1/businesses?id=eq.${encodeURIComponent(payload.businessId)}&select=id,number&limit=1`;
  const profileQuery =
    `/rest/v1/business_profiles?business_id=eq.${encodeURIComponent(payload.businessId)}&select=profile&limit=1`;
  const campaignQuery =
    `/rest/v1/campaigns?business_id=eq.${encodeURIComponent(payload.businessId)}&select=payload&order=updated_at.desc&limit=25`;

  const [userResponse, businessResponse, profileResponse, campaignResponse] =
    await Promise.all([
      supabase("/auth/v1/user", payload.accessToken),
      supabase(businessQuery, payload.accessToken),
      supabase(profileQuery, payload.accessToken),
      supabase(campaignQuery, payload.accessToken),
    ]);

  if (!userResponse.ok) throw new Error("studio_auth_expired");
  if (!businessResponse.ok || !profileResponse.ok || !campaignResponse.ok) {
    throw new Error("studio_context_unavailable");
  }

  const businesses = await businessResponse.json();
  if (!Array.isArray(businesses) || businesses[0]?.id !== payload.businessId) {
    throw new Error("studio_business_forbidden");
  }
  const profiles = await profileResponse.json();
  const campaigns = await campaignResponse.json();
  const profile = profiles?.[0]?.profile || {};
  const context = {
    businessId: payload.businessId,
    businessNumber: businesses[0]?.number ?? null,
    businessName:
      typeof profile.businessName === "string" && profile.businessName.trim()
        ? profile.businessName.trim()
        : "OTR Growth Business",
    profile,
    campaigns: Array.isArray(campaigns)
      ? campaigns.map((row) => row?.payload).filter(Boolean)
      : [],
  };

  authCache.set(key, { context, expiresAt: Date.now() + 60_000 });
  return context;
}

function writeContext(projectDir, context) {
  writeFileSync(
    join(projectDir, "OTR-CONTEXT.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "OTR Growth authenticated business context",
        ...context,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(projectDir, "OTR-CONTEXT.md"),
    `# OTR Growth Content Context

Business: ${context.businessName}
Business ID: ${context.businessId}

This folder is the official HyperFrames project used by OTR Growth Content Studio.
Use OTR-CONTEXT.json for the latest Business DNA and campaign context.
Keep HyperFrames composition files editable and use the official HyperFrames lint/check/render workflow.
`,
  );
}

function fallbackProject(projectDir, context) {
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  mkdirSync(join(projectDir, "compositions"), { recursive: true });
  writeFileSync(
    join(projectDir, "hyperframes.json"),
    JSON.stringify(
      {
        $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
        registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
        paths: {
          blocks: "compositions",
          components: "compositions/components",
          assets: "assets",
        },
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(projectDir, "meta.json"),
    JSON.stringify({ name: context.businessName, source: "OTR Growth" }, null, 2) + "\n",
  );
  const title = String(context.businessName).replace(/[<>&"]/g, "");
  writeFileSync(
    join(projectDir, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} Content Studio</title>
<style>
html,body{margin:0;background:#050505;color:#fff;font-family:Arial,sans-serif}
#main{position:relative;overflow:hidden;background:radial-gradient(circle at 70% 15%,#38106b 0%,#050505 46%)}
.frame{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:90px;box-sizing:border-box}
.eyebrow{letter-spacing:.24em;text-transform:uppercase;color:#a78bfa;font-size:26px}
h1{font-size:86px;line-height:.94;max-width:850px;margin:28px auto}
p{font-size:30px;color:#c7c7c7}
</style>
</head>
<body>
<div id="main" data-composition-id="main" data-start="0" data-duration="6" data-width="1080" data-height="1920" data-no-timeline>
  <section class="frame clip" data-start="0" data-duration="6" data-track-index="1">
    <div>
      <div class="eyebrow">OTR GROWTH · HYPERFRAMES</div>
      <h1>${title}</h1>
      <p>Your official HyperFrames project is ready to build.</p>
    </div>
  </section>
</div>
</body>
</html>`,
  );
}

function ensureProject(context) {
  const projectDir = join(PROJECTS_DIR, context.businessId);
  if (!existsSync(join(projectDir, "index.html"))) {
    mkdirSync(PROJECTS_DIR, { recursive: true });
    const initialized = spawnSync(
      CLI,
      [
        "init",
        projectDir,
        "--resolution",
        "portrait",
        "--non-interactive",
      ],
      {
        env: {
          ...process.env,
          HYPERFRAMES_NO_UPDATE_CHECK: "1",
          CI: "1",
        },
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    if (initialized.status !== 0 || !existsSync(join(projectDir, "index.html"))) {
      console.warn("Official init did not complete; using a minimal valid HyperFrames starter.", {
        status: initialized.status,
        stderr: initialized.stderr?.slice(-1000),
      });
      fallbackProject(projectDir, context);
    }
  }
  writeContext(projectDir, context);
  return projectDir;
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitUntilReady(port, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`HyperFrames preview exited with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/projects`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("HyperFrames preview did not become ready.");
}

async function startPreview(context) {
  const existing = sessions.get(context.businessId);
  if (existing && existing.child.exitCode === null) {
    writeContext(existing.projectDir, context);
    return existing;
  }
  if (pending.has(context.businessId)) return pending.get(context.businessId);

  const task = (async () => {
    const projectDir = ensureProject(context);
    const port = await freePort();
    const child = spawn(
      CLI,
      [
        "preview",
        projectDir,
        "--port",
        String(port),
        "--foreground",
        "--no-open",
      ],
      {
        env: {
          ...process.env,
          HYPERFRAMES_NO_UPDATE_CHECK: "1",
          PUPPETEER_EXECUTABLE_PATH:
            process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
          HYPERFRAMES_BROWSER_PATH:
            process.env.HYPERFRAMES_BROWSER_PATH || "/usr/bin/chromium",
          CI: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) =>
      process.stdout.write(`[hf:${context.businessId.slice(0, 8)}] ${chunk}`),
    );
    child.stderr.on("data", (chunk) =>
      process.stderr.write(`[hf:${context.businessId.slice(0, 8)}] ${chunk}`),
    );
    child.on("exit", () => {
      const current = sessions.get(context.businessId);
      if (current?.child === child) sessions.delete(context.businessId);
    });
    await waitUntilReady(port, child);
    const session = { port, child, projectDir, context };
    sessions.set(context.businessId, session);
    return session;
  })().finally(() => pending.delete(context.businessId));

  pending.set(context.businessId, task);
  return task;
}

function proxy(request, response, port) {
  const headers = { ...request.headers };
  delete headers.host;
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port,
      path: request.url,
      method: request.method,
      headers: {
        ...headers,
        host: `127.0.0.1:${port}`,
        "x-forwarded-host": request.headers.host || "",
        "x-forwarded-proto": request.headers["x-forwarded-proto"] || "https",
      },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", (error) => {
    console.error("HyperFrames proxy error", error);
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "application/json" });
    }
    response.end(JSON.stringify({ error: "hyperframes_upstream_unavailable" }));
  });
  request.pipe(upstream);
}

async function verifyOfficialStudio() {
  rmSync(SMOKE_DIR, { recursive: true, force: true });
  mkdirSync(SMOKE_DIR, { recursive: true });

  const init = spawnSync(
    CLI,
    [
      "init",
      SMOKE_DIR,
      "--resolution",
      "portrait",
      "--non-interactive",
      "--skip-skills",
    ],
    {
      env: {
        ...process.env,
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        CI: "1",
      },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  if (init.status !== 0) {
    throw new Error(
      `Official HyperFrames init smoke failed: ${(init.stderr || init.stdout || "").slice(-1200)}`,
    );
  }

  const port = await freePort();
  const child = spawn(
    CLI,
    [
      "preview",
      SMOKE_DIR,
      "--port",
      String(port),
      "--foreground",
      "--no-open",
    ],
    {
      env: {
        ...process.env,
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        PUPPETEER_EXECUTABLE_PATH:
          process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        CI: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });

  try {
    await waitUntilReady(port, child);
    const studio = await fetch(`http://127.0.0.1:${port}/`);
    const html = await studio.text();
    if (!studio.ok || !html.includes('id="root"')) {
      throw new Error(
        `Official HyperFrames Studio smoke returned ${studio.status} without the Studio root.`,
      );
    }
    const projectsResponse = await fetch(`http://127.0.0.1:${port}/api/projects`);
    const projects = await projectsResponse.json();
    if (!projectsResponse.ok || !Array.isArray(projects?.projects) || projects.projects.length < 1) {
      throw new Error("Official HyperFrames Studio project API smoke failed.");
    }

    const generatorBridge = await installGeneratedProject({
      CLI,
      projectDir: SMOKE_DIR,
      context: {
        businessId: "00000000-0000-4000-8000-000000000001",
        businessName: "OTR Generator Smoke",
      },
      payload: {
        businessId: "00000000-0000-4000-8000-000000000001",
        websites: [],
        title: "Generator bridge smoke",
        summary: "Validates the real Content Studio generation install/check path.",
        prompt: "Runtime smoke only",
        durationSeconds: 6,
        aspectRatio: "9:16",
        html: `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<title>OTR Generator Smoke</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
html,body{margin:0;background:#050505;color:#fff;font-family:Inter,system-ui,sans-serif}
#main{position:relative;width:100%;height:100%;overflow:hidden}
.clip{position:absolute;inset:0;display:grid;place-items:center}
h1{margin:0;font-size:110px}
</style>
</head>
<body>
<div id="main" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="6">
  <section class="clip" data-start="0" data-duration="6" data-track-index="1">
    <h1 id="smoke-title">OTR Generator</h1>
  </section>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.fromTo("#smoke-title",{opacity:0,y:120,scale:.9},{opacity:1,y:0,scale:1,duration:1,ease:"power3.out"},0.2);
tl.to("#smoke-title",{y:-40,scale:1.06,duration:1,ease:"power1.inOut"},4.2);
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>`,
      },
    });
    if (!generatorBridge.ok) {
      throw new Error(
        `Content Studio generator bridge smoke failed: ${generatorBridge.findings || generatorBridge.error}`,
      );
    }

    const renderOutput = "/tmp/otr-hyperframes-official-smoke.mp4";
    rmSync(renderOutput, { force: true });
    const render = spawnSync(
      CLI,
      [
        "render",
        SMOKE_DIR,
        "--output",
        renderOutput,
        "--fps",
        "6",
        "--quality",
        "draft",
        "--workers",
        "1",
        "--no-browser-gpu",
      ],
      {
        env: {
          ...process.env,
          CONTAINER: "true",
          HYPERFRAMES_NO_UPDATE_CHECK: "1",
          PUPPETEER_EXECUTABLE_PATH:
            process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
          HYPERFRAMES_BROWSER_PATH:
            process.env.HYPERFRAMES_BROWSER_PATH || "/usr/bin/chromium",
          CI: "1",
        },
        encoding: "utf8",
        timeout: 180_000,
      },
    );
    if (render.status !== 0 || !existsSync(renderOutput)) {
      throw new Error(
        `Official HyperFrames render smoke failed: ${(render.stderr || render.stdout || "").slice(-1800)}`,
      );
    }
    const renderBytes = statSync(renderOutput).size;
    if (renderBytes < 1024) {
      throw new Error(`Official HyperFrames render smoke produced only ${renderBytes} bytes.`);
    }
    rmSync(renderOutput, { force: true });

    return {
      ok: true,
      hyperframes: "0.8.48",
      studioBundle: true,
      projectApi: true,
      generatorBridge: true,
      renderPipeline: true,
      renderSmokeBytes: renderBytes,
    };
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} ${stderr.slice(-1600)}`.trim(),
    );
  } finally {
    child.kill("SIGTERM");
    rmSync(SMOKE_DIR, { recursive: true, force: true });
  }
}

const officialStudioSmoke = await verifyOfficialStudio();
console.log("Official HyperFrames Studio smoke passed", officialStudioSmoke);

const server = http.createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        service: "otr-hyperframes-host",
        ...officialStudioSmoke,
        activeProjects: sessions.size,
      }),
    );
    return;
  }

  if (request.url === "/otr/generated-asset" && request.method === "POST") {
    try {
      const accessToken = readBearer(request);
      if (!accessToken) throw new Error("studio_auth_missing");
      const contentType = String(request.headers["content-type"] || "").toLowerCase();

      let businessId = "";
      let source;
      if (contentType.includes("application/json")) {
        const body = await readJsonBody(request, 64_000);
        businessId = typeof body.businessId === "string" ? body.businessId : "";
        source = { url: typeof body.url === "string" ? body.url : "" };
      } else {
        businessId = String(request.headers["x-otr-business-id"] || "");
        source = { data: await readBinaryBody(request) };
      }

      if (!/^[0-9a-f-]{36}$/i.test(businessId)) throw new Error("studio_business_invalid");
      const context = await authorize({ accessToken, businessId });
      const projectDir = ensureProject(context);
      const result = await storeGeneratedVideoAsset({ projectDir, source });

      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ ok: true, ...result }));
    } catch (error) {
      console.error("Generated video asset rejected", error);
      const tooLarge = error instanceof Error && error.message === "request_too_large";
      response.writeHead(tooLarge ? 413 : 400, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "generated_asset_failed",
        }),
      );
    }
    return;
  }

  if (request.url === "/otr/render" && request.method === "POST") {
    try {
      const accessToken = readBearer(request);
      if (!accessToken) throw new Error("studio_auth_missing");
      const body = await readJsonBody(request, 16_000);
      const businessId = typeof body.businessId === "string" ? body.businessId : "";
      if (!/^[0-9a-f-]{36}$/i.test(businessId)) throw new Error("studio_business_invalid");

      const context = await authorize({ accessToken, businessId });
      const projectDir = ensureProject(context);
      const result = renderGeneratedProject({ CLI, projectDir });
      if (!result.ok) {
        response.writeHead(422, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify(result));
        return;
      }

      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          ok: true,
          bytes: result.bytes,
          fps: result.fps,
          quality: result.quality,
        }),
      );
    } catch (error) {
      console.error("Final render rejected", error);
      response.writeHead(400, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "render_failed",
        }),
      );
    }
    return;
  }

  if (request.url?.startsWith("/otr/delivery") && request.method === "GET") {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const requestedBusinessId = url.searchParams.get("businessId") || "";
      let accessToken = readBearer(request);
      let businessId = requestedBusinessId;

      if (!accessToken) {
        const session = readSession(request);
        accessToken = session.accessToken;
        if (businessId && businessId !== session.businessId) {
          throw new Error("studio_business_forbidden");
        }
        businessId = session.businessId;
      }

      if (!/^[0-9a-f-]{36}$/i.test(businessId)) throw new Error("studio_business_invalid");
      const context = await authorize({ accessToken, businessId });
      const projectDir = ensureProject(context);
      const output = generatedDeliveryPath(projectDir);
      if (!existsSync(output)) {
        response.writeHead(404, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ error: "delivery_not_ready" }));
        return;
      }

      const bytes = statSync(output).size;
      response.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": String(bytes),
        "content-disposition": 'inline; filename="otr-growth-ad.mp4"',
        "cache-control": "private, no-store",
      });
      createReadStream(output).pipe(response);
    } catch (error) {
      console.error("Delivery request rejected", error);
      response.writeHead(401, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ error: "delivery_unauthorized" }));
    }
    return;
  }

  if (request.url === "/otr/generate" && request.method === "POST") {
    try {
      const accessToken = readBearer(request);
      if (!accessToken) throw new Error("studio_auth_missing");
      const body = await readJsonBody(request);
      const businessId = typeof body.businessId === "string" ? body.businessId : "";
      if (!/^[0-9a-f-]{36}$/i.test(businessId)) throw new Error("studio_business_invalid");

      const context = await authorize({ accessToken, businessId });
      const projectDir = ensureProject(context);
      const result = await installGeneratedProject({
        CLI,
        projectDir,
        context,
        payload: body,
      });

      if (!result.ok) {
        response.writeHead(422, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify(result));
        return;
      }

      const current = sessions.get(context.businessId);
      if (current?.child && current.child.exitCode === null) {
        current.child.kill("SIGTERM");
      }
      sessions.delete(context.businessId);
      await startPreview(context);

      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(result));
    } catch (error) {
      console.error("Video generation install rejected", error);
      const tooLarge = error instanceof Error && error.message === "request_too_large";
      response.writeHead(tooLarge ? 413 : 400, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : "generation_install_failed",
        }),
      );
    }
    return;
  }

  try {
    const payload = readSession(request);
    const context = await authorize(payload);
    const preview = await startPreview(context);
    proxy(request, response, preview.port);
  } catch (error) {
    console.error("Studio request rejected", error);
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "content_studio_unauthorized" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OTR HyperFrames host listening on :${PORT}`);
});

function shutdown() {
  for (const session of sessions.values()) {
    session.child.kill("SIGTERM");
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

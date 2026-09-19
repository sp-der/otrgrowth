import { lookup } from "node:dns/promises";
import net from "node:net";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (net.isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
  }
  return true;
}

async function publicHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Website captures require public HTTPS URLs.");
  }
  const resolved = await lookup(url.hostname, { all: true });
  if (!resolved.length || resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(`Website host is not public: ${url.hostname}`);
  }
  return url;
}

function cleanGeneratedCaptures(assetsDir) {
  for (const name of readdirSync(assetsDir)) {
    if (/^site-\d{2}\.png$/.test(name) || /^brand-logo\.(png|jpg|webp)$/.test(name)) {
      rmSync(join(assetsDir, name), { force: true });
    }
  }
}

async function captureWebsites(websites, assetsDir) {
  const captures = [];
  for (let index = 0; index < websites.length; index += 1) {
    const url = await publicHttpsUrl(websites[index]);
    const name = `site-${String(index + 1).padStart(2, "0")}.png`;
    const output = join(assetsDir, name);
    const result = spawnSync(
      process.env.HYPERFRAMES_BROWSER_PATH || "/usr/bin/chromium",
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=1440,1200",
        "--force-device-scale-factor=1",
        "--virtual-time-budget=6500",
        `--screenshot=${output}`,
        url.toString(),
      ],
      { encoding: "utf8", timeout: 35_000 },
    );
    if (result.status !== 0 || !existsSync(output)) {
      throw new Error(
        `Could not capture ${url.hostname}: ${(result.stderr || result.stdout || "Chromium capture failed").slice(-800)}`,
      );
    }
    captures.push({ url: url.toString(), path: `assets/${name}` });
  }
  return captures;
}

function saveLogo(logo, assetsDir) {
  if (!logo) return null;
  const ext = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[logo.mimeType];
  if (!ext || typeof logo.dataBase64 !== "string" || logo.dataBase64.length > 3_000_000) {
    throw new Error("Logo must be a PNG, JPG or WebP within the upload limit.");
  }
  const bytes = Buffer.from(logo.dataBase64, "base64");
  if (!bytes.length || bytes.length > 2_300_000) throw new Error("Logo payload is invalid or too large.");
  const path = join(assetsDir, `brand-logo.${ext}`);
  writeFileSync(path, bytes);
  return `assets/brand-logo.${ext}`;
}

function runCheck(CLI, projectDir) {
  const result = spawnSync(
    CLI,
    ["check", projectDir, "--json", "--samples", "5", "--no-browser-gpu"],
    {
      env: {
        ...process.env,
        CONTAINER: "true",
        HYPERFRAMES_NO_UPDATE_CHECK: "1",
        HYPERFRAMES_BROWSER_PATH:
          process.env.HYPERFRAMES_BROWSER_PATH || "/usr/bin/chromium",
        PUPPETEER_EXECUTABLE_PATH:
          process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        CI: "1",
      },
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 2_000_000,
    },
  );
  const findings = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  return { ok: result.status === 0, findings };
}

export async function installGeneratedProject({ CLI, projectDir, context, payload }) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid generation payload.");
  if (payload.businessId !== context.businessId) throw new Error("Business mismatch.");
  if (typeof payload.html !== "string" || payload.html.length < 500 || payload.html.length > 160_000) {
    throw new Error("Generated HyperFrames HTML is invalid.");
  }
  if (!payload.html.includes('data-composition-id="main"')) {
    throw new Error("Generated project is missing the main HyperFrames composition.");
  }
  const websites = Array.isArray(payload.websites) ? payload.websites.slice(0, 8) : [];
  if (!websites.every((value) => typeof value === "string")) throw new Error("Website list is invalid.");

  const assetsDir = join(projectDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  cleanGeneratedCaptures(assetsDir);

  const captures = await captureWebsites(websites, assetsDir);
  const logoPath = saveLogo(payload.logo, assetsDir);
  const indexPath = join(projectDir, "index.html");
  const previous = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;

  writeFileSync(indexPath, payload.html);
  writeFileSync(
    join(projectDir, "OTR-GENERATION.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        businessId: context.businessId,
        businessName: context.businessName,
        title: payload.title || "Generated video",
        summary: payload.summary || "",
        prompt: payload.prompt || "",
        durationSeconds: payload.durationSeconds,
        aspectRatio: payload.aspectRatio,
        websites,
        captures,
        logoPath,
      },
      null,
      2,
    ) + "\n",
  );

  const check = runCheck(CLI, projectDir);
  if (!check.ok) {
    if (previous !== null) writeFileSync(indexPath, previous);
    return {
      ok: false,
      error: "The generated project did not pass the official HyperFrames check.",
      findings: check.findings.slice(0, 30_000),
      captures,
    };
  }

  return {
    ok: true,
    captures,
    check: check.findings.slice(0, 30_000),
  };
}

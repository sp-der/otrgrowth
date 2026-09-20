import { lookup } from "node:dns/promises";
import net from "node:net";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--window-size=1440,1200",
        "--force-device-scale-factor=1",
        "--virtual-time-budget=6500",
        `--screenshot=${output}`,
        url.toString(),
      ],
      { encoding: "utf8", timeout: 35_000 },
    );
    const captureReady =
      existsSync(output) && statSync(output).size >= 5_000;
    if (!captureReady) {
      rmSync(output, { force: true });
      const diagnostic = (result.stderr || result.stdout || "Chromium capture failed")
        .split("\n")
        .filter(
          (line) =>
            line &&
            !/google_apis\/gcm|PHONE_REGISTRATION_ERROR|DEPRECATED_ENDPOINT|Authentication Failed: wrong_secret/i.test(
              line,
            ),
        )
        .slice(-8)
        .join("\n")
        .slice(-800);
      throw new Error(
        `Could not capture ${url.hostname}: ${diagnostic || "Chromium did not produce a usable screenshot."}`,
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

const MAX_GENERATED_VIDEO_BYTES = 25_000_000;

function validMp4(bytes) {
  return (
    Buffer.isBuffer(bytes) &&
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp"
  );
}

export async function storeGeneratedVideoAsset({ projectDir, source }) {
  let bytes;
  if (source?.url) {
    const url = await publicHttpsUrl(source.url);
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Generated video download failed with ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") || "";
    const length = Number(response.headers.get("content-length") || "0");
    if (
      !contentType.toLowerCase().startsWith("video/") ||
      (Number.isFinite(length) && length > MAX_GENERATED_VIDEO_BYTES)
    ) {
      await response.body?.cancel();
      throw new Error("Generated video response is not an accepted video asset.");
    }
    bytes = Buffer.from(await response.arrayBuffer());
  } else if (source?.data) {
    bytes = Buffer.isBuffer(source.data) ? source.data : Buffer.from(source.data);
  } else {
    throw new Error("Generated video source is missing.");
  }

  if (bytes.length > MAX_GENERATED_VIDEO_BYTES || !validMp4(bytes)) {
    throw new Error("Generated video must be a valid MP4 within the asset limit.");
  }

  const assetsDir = join(projectDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  const output = join(assetsDir, "ai-hero.mp4");
  writeFileSync(output, bytes);
  return { path: "assets/ai-hero.mp4", bytes: bytes.length };
}

function runSnapshotQa(CLI, projectDir) {
  const qaDir = join(projectDir, "otr-qa");
  rmSync(qaDir, { recursive: true, force: true });
  mkdirSync(qaDir, { recursive: true });

  const result = spawnSync(
    CLI,
    [
      "snapshot",
      projectDir,
      "--frames",
      "5",
      "--output",
      qaDir,
      "--describe",
      "false",
      "--no-browser-gpu",
    ],
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
  if (result.status !== 0) {
    return { ok: false, findings };
  }

  const contactName = readdirSync(qaDir).find((name) =>
    /^contact-sheet(?:-\d+)?\.jpg$/i.test(name),
  );
  if (!contactName) {
    return { ok: false, findings: `${findings}\nNo QA contact sheet was produced.`.trim() };
  }

  const contactPath = join(qaDir, contactName);
  const bytes = statSync(contactPath).size;
  if (bytes <= 0 || bytes > 6_000_000) {
    return {
      ok: false,
      findings: `${findings}\nQA contact sheet size was outside the accepted range.`.trim(),
    };
  }

  return {
    ok: true,
    findings,
    contactSheetBase64: readFileSync(contactPath).toString("base64"),
    mediaType: "image/jpeg",
  };
}

export function renderGeneratedProject({ CLI, projectDir }) {
  const renderDir = join(projectDir, "renders");
  mkdirSync(renderDir, { recursive: true });
  const output = join(renderDir, "latest.mp4");
  rmSync(output, { force: true });

  const result = spawnSync(
    CLI,
    [
      "render",
      projectDir,
      "--output",
      output,
      "--fps",
      "30",
      "--quality",
      "high",
      "--workers",
      "1",
      "--no-browser-gpu",
    ],
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
      timeout: 270_000,
      maxBuffer: 3_000_000,
    },
  );

  const findings = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status !== 0 || !existsSync(output)) {
    return { ok: false, error: "Final HyperFrames render failed.", findings };
  }

  const bytes = statSync(output).size;
  if (bytes < 10_000) {
    rmSync(output, { force: true });
    return {
      ok: false,
      error: "Final HyperFrames render produced an invalid artifact.",
      findings,
    };
  }

  return {
    ok: true,
    path: output,
    bytes,
    fps: 30,
    quality: "high",
  };
}

export function generatedDeliveryPath(projectDir) {
  return join(projectDir, "renders", "latest.mp4");
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
  const generatedAssets = Array.isArray(payload.generatedAssets)
    ? payload.generatedAssets.filter((value) => value === "assets/ai-hero.mp4").slice(0, 1)
    : [];
  if (
    Array.isArray(payload.generatedAssets) &&
    payload.generatedAssets.some((value) => value !== "assets/ai-hero.mp4")
  ) {
    throw new Error("Generated asset list is invalid.");
  }

  const assetsDir = join(projectDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  cleanGeneratedCaptures(assetsDir);
  if (!generatedAssets.includes("assets/ai-hero.mp4")) {
    rmSync(join(assetsDir, "ai-hero.mp4"), { force: true });
  } else if (!existsSync(join(assetsDir, "ai-hero.mp4"))) {
    throw new Error("The planned generated video asset is missing.");
  }

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
        generatedAssets,
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

  const qa = runSnapshotQa(CLI, projectDir);
  if (!qa.ok) {
    if (previous !== null) writeFileSync(indexPath, previous);
    return {
      ok: false,
      error: "The generated project could not produce visual QA snapshots.",
      findings: qa.findings.slice(0, 30_000),
      captures,
    };
  }

  return {
    ok: true,
    captures,
    check: check.findings.slice(0, 30_000),
    qa: {
      findings: qa.findings.slice(0, 20_000),
      contactSheetBase64: qa.contactSheetBase64,
      mediaType: qa.mediaType,
    },
  };
}

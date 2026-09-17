import {
  compositionSchema,
  briefSchema,
  creativeDNASchema,
  type CreativeBrief,
  type Composition,
} from "./schemas";
import type { Business, Campaign } from "../domain/schemas";
export function buildComposition(
  business: Business,
  campaign: Campaign,
  brief: CreativeBrief,
): Composition {
  if (campaign.businessId !== business.id)
    throw new Error("Campaign belongs to a different business.");
  const dna = creativeDNASchema.parse(business.profile.creativeDNA ?? {});
  const parsed = briefSchema.parse(brief);
  const allCopy = [
    parsed.hook,
    parsed.bodyCopy,
    parsed.cta,
    ...parsed.scenes.map((s) => s.text),
  ]
    .join(" ")
    .toLowerCase();
  for (const word of dna.wordsToAvoid
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)) {
    if (allCopy.includes(word))
      throw new Error(`Copy includes a word marked to avoid: ${word}`);
  }
  return compositionSchema.parse({
    version: 1,
    brand: business.profile.businessName,
    dna,
    brief: parsed,
  });
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function compositionHTML(input: Composition): string {
  const { brand, dna, brief } = compositionSchema.parse(input);
  const [width, height] =
    brief.aspectRatio === "9:16"
      ? [1080, 1920]
      : brief.aspectRatio === "1:1"
        ? [1080, 1080]
        : [1920, 1080];
  const texts = [
    brief.hook,
    ...brief.scenes.map((s) => s.text),
    brief.bodyCopy,
    brief.cta,
  ];
  const seconds = brief.durationSeconds / texts.length;
  const align = ["Testimonial", "Announcement", "Offer / Sale"].includes(
    brief.template,
  )
    ? "center"
    : "left";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src data:; connect-src 'self'"><style>*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${dna.primaryColor};color:${dna.secondaryColor};font-family:${dna.bodyFont}}main{position:relative;width:100%;height:100%}.scene{position:absolute;inset:0;padding:9%;display:flex;flex-direction:column;justify-content:center;text-align:${align};background:linear-gradient(140deg,${dna.primaryColor},${dna.primaryColor} 70%,${dna.accentColor})}small{font-size:30px;letter-spacing:5px;color:${dna.accentColor}}h1{font:700 ${width === 1920 ? 100 : 80}px ${dna.headingFont};line-height:1.12;overflow-wrap:anywhere}footer{font-size:28px}</style></head><body><main id="otr" data-composition-id="otr" data-start="0" data-duration="${brief.durationSeconds}" data-width="${width}" data-height="${height}" data-no-timeline>${texts.map((t, i) => `<section id="scene-${i}" class="clip scene" data-start="${i * seconds}" data-duration="${seconds}" data-track-index="${i}"><small>${escape(brand)}</small><h1>${brief.template === "Testimonial" && i > 0 && i < texts.length - 1 ? "“" : ""}${escape(t)}</h1><footer>${escape(i === texts.length - 1 ? brief.cta : brief.template)}</footer></section>`).join("")}</main></body></html>`;
}

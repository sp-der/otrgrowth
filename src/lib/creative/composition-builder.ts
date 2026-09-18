import {
  briefSchema,
  compositionSchema,
  compositionV2Schema,
  creativeDNASchema,
  fitSceneDurations,
  type CreativeBrief,
  type Composition,
  type CreativeScene,
  type SourceAsset,
} from "./schemas";
import type { Business, Campaign } from "../domain/schemas";

export function buildComposition(
  business: Business,
  campaign: Campaign,
  brief: CreativeBrief,
): Composition {
  if (campaign.businessId !== business.id) {
    throw new Error("Campaign belongs to a different business.");
  }
  const dna = creativeDNASchema.parse(business.profile.creativeDNA ?? {});
  const parsed = briefSchema.parse(brief);
  const scenes = fitSceneDurations(parsed.scenes, parsed.durationSeconds);
  const allCopy = [
    parsed.hook,
    parsed.bodyCopy,
    parsed.cta,
    ...scenes.flatMap((scene) => [scene.text, scene.subtext, scene.cta]),
  ]
    .join(" ")
    .toLowerCase();

  for (const word of dna.wordsToAvoid
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)) {
    if (allCopy.includes(word)) {
      throw new Error("Copy includes a word marked to avoid: " + word);
    }
  }

  return compositionV2Schema.parse({
    version: 2,
    brand: business.profile.businessName,
    dna,
    brief: { ...parsed, scenes },
  });
}

const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

function assetFile(asset: SourceAsset) {
  const extension = asset.storagePath.split(".").at(-1) || "bin";
  return "assets/" + asset.id + "." + extension;
}

function mediaMarkup(
  asset: SourceAsset | undefined,
  className: string,
): string {
  if (!asset || asset.kind === "audio") return "";
  const source = assetFile(asset);
  if (asset.kind === "video") {
    return (
      '<video class="' +
      className +
      '" src="' +
      source +
      '" autoplay muted loop playsinline preload="auto"></video>'
    );
  }
  return '<img class="' + className + '" src="' + source + '" alt="">';
}

function sceneMarkup(
  scene: CreativeScene,
  index: number,
  start: number,
  brand: string,
  assets: SourceAsset[],
): string {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const background = scene.backgroundAssetId
    ? byId.get(scene.backgroundAssetId)
    : undefined;
  const galleryAssets = scene.mediaAssetIds
    .map((id) => byId.get(id))
    .filter((asset): asset is SourceAsset => Boolean(asset && asset.kind !== "audio"));
  const logo = assets.find((asset) => asset.kind === "logo");
  const duration = scene.durationSeconds;
  const textDelay = start + Math.min(0.22, duration * 0.08);
  const exitDelay = Math.max(start, start + duration - 0.36);
  const positionClass = "position-" + scene.textPosition;
  const alignClass = "align-" + scene.textAlign;
  const transitionClass = "transition-" + scene.transitionIn;
  const animationClass = "motion-" + scene.animationPreset;
  const emphasisClass = "emphasis-" + scene.emphasis;

  const gallery =
    galleryAssets.length > 1
      ? '<div class="gallery">' +
        galleryAssets
          .slice(0, 4)
          .map((asset) => mediaMarkup(asset, "gallery-media"))
          .join("") +
        "</div>"
      : "";

  return (
    '<section id="scene-' +
    index +
    '" class="clip scene ' +
    transitionClass +
    " " +
    positionClass +
    " " +
    alignClass +
    " " +
    emphasisClass +
    '" data-start="' +
    start.toFixed(2) +
    '" data-duration="' +
    duration.toFixed(2) +
    '" data-track-index="' +
    index +
    '" style="--scene-start:' +
    start.toFixed(2) +
    "s;--scene-duration:" +
    duration.toFixed(2) +
    "s;--text-delay:" +
    textDelay.toFixed(2) +
    "s;--exit-delay:" +
    exitDelay.toFixed(2) +
    's">' +
    '<div class="ambient"><span></span><span></span></div>' +
    mediaMarkup(background || galleryAssets[0], "scene-media " + animationClass) +
    gallery +
    '<div class="shade" style="opacity:' +
    scene.overlayOpacity +
    '"></div>' +
    (scene.logoEnabled && logo ? mediaMarkup(logo, "scene-logo") : "") +
    '<div class="copy ' +
    animationClass +
    '">' +
    '<small>' +
    escapeHTML(brand) +
    "</small>" +
    (scene.text ? "<h1>" + escapeHTML(scene.text) + "</h1>" : "") +
    (scene.subtext ? "<p>" + escapeHTML(scene.subtext) + "</p>" : "") +
    (scene.cta ? '<span class="cta">' + escapeHTML(scene.cta) + "</span>" : "") +
    "</div>" +
    (scene.captionEnabled && scene.type !== "end-card"
      ? '<div class="scene-type">' + escapeHTML(scene.type.replace("-", " ")) + "</div>"
      : "") +
    '<div class="exit transition-out-' +
    scene.transitionOut +
    '"></div>' +
    "</section>"
  );
}

export function compositionHTML(input: Composition): string {
  const parsed = compositionSchema.parse(input);
  const { brand, dna } = parsed;
  const brief = briefSchema.parse(parsed.brief);
  const [width, height] =
    brief.aspectRatio === "9:16"
      ? [1080, 1920]
      : brief.aspectRatio === "1:1"
        ? [1080, 1080]
        : [1920, 1080];

  let start = 0;
  const scenes = brief.scenes
    .map((scene, index) => {
      const markup = sceneMarkup(
        scene,
        index,
        start,
        brand,
        brief.sourceAssets,
      );
      start += scene.durationSeconds;
      return markup;
    })
    .join("");

  const headingSize = width === 1920 ? 112 : width === 1080 && height === 1080 ? 82 : 92;
  const bodySize = width === 1920 ? 40 : 34;

  const css =
    "*{box-sizing:border-box}html,body{margin:0;width:" +
    width +
    "px;height:" +
    height +
    "px;overflow:hidden;background:" +
    dna.primaryColor +
    ";color:" +
    dna.secondaryColor +
    ";font-family:" +
    dna.bodyFont +
    ",Arial,sans-serif}main{position:relative;width:100%;height:100%;overflow:hidden;background:" +
    dna.primaryColor +
    "}.scene{position:absolute;inset:0;overflow:hidden;background:" +
    dna.primaryColor +
    ";display:flex;padding:8%;isolation:isolate}.ambient{position:absolute;inset:-20%;z-index:-4;background:radial-gradient(circle at 20% 20%," +
    dna.accentColor +
    "55,transparent 32%),radial-gradient(circle at 80% 70%," +
    dna.secondaryColor +
    "18,transparent 36%),linear-gradient(135deg," +
    dna.primaryColor +
    "," +
    dna.primaryColor +
    " 68%," +
    dna.accentColor +
    "33)}.ambient span{position:absolute;width:45%;aspect-ratio:1;border-radius:50%;filter:blur(70px);background:" +
    dna.accentColor +
    "33;animation:floatOrb 8s ease-in-out infinite alternate}.ambient span:nth-child(2){right:0;bottom:0;animation-delay:-3s}.scene-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-3}.shade{position:absolute;inset:0;background:#000;z-index:-2}.copy{position:relative;z-index:4;max-width:90%;animation-delay:var(--text-delay);animation-fill-mode:both}.copy small{display:block;color:" +
    dna.accentColor +
    ";font-size:26px;letter-spacing:5px;text-transform:uppercase;margin-bottom:24px}.copy h1{font:800 " +
    headingSize +
    "px/1.02 " +
    dna.headingFont +
    ",Arial,sans-serif;letter-spacing:-3px;margin:0;overflow-wrap:anywhere;text-wrap:balance}.copy p{font-size:" +
    bodySize +
    "px;line-height:1.45;max-width:85%;margin:28px 0 0;color:" +
    dna.secondaryColor +
    "dd}.cta{display:inline-flex;margin-top:34px;padding:18px 28px;border-radius:999px;background:" +
    dna.accentColor +
    ";color:" +
    dna.primaryColor +
    ";font-size:28px;font-weight:800}.scene-logo{position:absolute;top:6%;right:6%;z-index:5;max-width:220px;max-height:120px;object-fit:contain;filter:drop-shadow(0 8px 24px #0008)}.scene-type{position:absolute;left:8%;bottom:4%;z-index:4;color:" +
    dna.secondaryColor +
    "99;font-size:22px;text-transform:uppercase;letter-spacing:4px}.position-top{align-items:flex-start;justify-content:center}.position-center{align-items:center;justify-content:center}.position-bottom{align-items:flex-end;justify-content:center}.position-left{align-items:center;justify-content:flex-start}.position-right{align-items:center;justify-content:flex-end}.align-left{text-align:left}.align-center{text-align:center}.align-right{text-align:right}.align-center .copy p,.align-center .copy{margin-left:auto;margin-right:auto}.align-right .copy p{margin-left:auto}.emphasis-strong .copy h1{font-size:" +
    Math.round(headingSize * 1.14) +
    "px}.emphasis-quiet .copy h1{font-weight:600;font-size:" +
    Math.round(headingSize * 0.82) +
    "px}.gallery{position:absolute;inset:0;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:5%;z-index:-3}.gallery-media{width:100%;height:100%;object-fit:cover;border-radius:24px}.transition-crossfade{animation:sceneFade .5s ease var(--scene-start) both}.transition-fade-through{animation:sceneFadeThrough .62s ease var(--scene-start) both}.transition-slide{animation:sceneSlide .58s cubic-bezier(.2,.8,.2,1) var(--scene-start) both}.transition-zoom{animation:sceneZoom .62s ease var(--scene-start) both}.transition-blur-fade{animation:sceneBlur .62s ease var(--scene-start) both}.motion-fade-up.copy{animation:textFadeUp .68s ease var(--text-delay) both}.motion-fade-in.copy{animation:textFade .6s ease var(--text-delay) both}.motion-slide-left.copy{animation:textLeft .7s cubic-bezier(.2,.8,.2,1) var(--text-delay) both}.motion-slide-right.copy{animation:textRight .7s cubic-bezier(.2,.8,.2,1) var(--text-delay) both}.motion-reveal.copy{animation:textReveal .75s ease var(--text-delay) both}.motion-pop-in.copy{animation:textPop .55s cubic-bezier(.2,1.4,.3,1) var(--text-delay) both}.motion-end-card-focus.copy{animation:endFocus .9s cubic-bezier(.2,.9,.2,1) var(--text-delay) both}.scene-media.motion-zoom-in{animation:mediaZoomIn var(--scene-duration) ease-out var(--scene-start) both}.scene-media.motion-zoom-out{animation:mediaZoomOut var(--scene-duration) ease-out var(--scene-start) both}.scene-media.motion-subtle-pan{animation:mediaPan var(--scene-duration) ease-in-out var(--scene-start) both}.exit{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:0}.transition-out-fade-through{background:" +
    dna.primaryColor +
    ";animation:exitFade .36s ease var(--exit-delay) both}.transition-out-blur-fade,.transition-out-crossfade{background:#000;animation:exitSoft .36s ease var(--exit-delay) both}.transition-out-zoom{box-shadow:inset 0 0 0 540px " +
    dna.primaryColor +
    ";animation:exitZoom .36s ease var(--exit-delay) both}.transition-out-slide{background:" +
    dna.primaryColor +
    ";animation:exitSlide .36s ease var(--exit-delay) both}@keyframes sceneFade{from{opacity:0}to{opacity:1}}@keyframes sceneFadeThrough{0%{opacity:0;filter:brightness(.25)}100%{opacity:1;filter:brightness(1)}}@keyframes sceneSlide{from{opacity:0;transform:translateX(7%)}to{opacity:1;transform:none}}@keyframes sceneZoom{from{opacity:0;transform:scale(1.07)}to{opacity:1;transform:scale(1)}}@keyframes sceneBlur{from{opacity:0;filter:blur(22px)}to{opacity:1;filter:blur(0)}}@keyframes textFadeUp{from{opacity:0;transform:translateY(55px)}to{opacity:1;transform:none}}@keyframes textFade{from{opacity:0}to{opacity:1}}@keyframes textLeft{from{opacity:0;transform:translateX(70px)}to{opacity:1;transform:none}}@keyframes textRight{from{opacity:0;transform:translateX(-70px)}to{opacity:1;transform:none}}@keyframes textReveal{from{opacity:0;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0)}}@keyframes textPop{from{opacity:0;transform:scale(.78)}to{opacity:1;transform:scale(1)}}@keyframes endFocus{from{opacity:0;transform:scale(.86);filter:blur(8px)}to{opacity:1;transform:scale(1);filter:blur(0)}}@keyframes mediaZoomIn{from{transform:scale(1)}to{transform:scale(1.12)}}@keyframes mediaZoomOut{from{transform:scale(1.13)}to{transform:scale(1)}}@keyframes mediaPan{from{transform:scale(1.08) translateX(-2%)}to{transform:scale(1.12) translateX(2%)}}@keyframes floatOrb{from{transform:translate(-8%,-5%) scale(.9)}to{transform:translate(12%,8%) scale(1.1)}}@keyframes exitFade{from{opacity:0}to{opacity:1}}@keyframes exitSoft{from{opacity:0}to{opacity:.55}}@keyframes exitZoom{from{opacity:0;transform:scale(1.12)}to{opacity:1;transform:scale(1)}}@keyframes exitSlide{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:none}}";

  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'self\' \'unsafe-inline\'; font-src data:; img-src \'self\' data: blob:; media-src \'self\' blob:; connect-src \'self\'">' +
    "<style>" +
    css +
    "</style></head><body>" +
    '<main id="otr" data-composition-id="otr" data-start="0" data-duration="' +
    brief.durationSeconds +
    '" data-width="' +
    width +
    '" data-height="' +
    height +
    '" data-no-timeline>' +
    scenes +
    "</main></body></html>"
  );
}

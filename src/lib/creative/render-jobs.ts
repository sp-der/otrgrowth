export type RenderState =
  | "draft"
  | "queued"
  | "rendering"
  | "completed"
  | "failed";
export function canTransition(from: RenderState, to: RenderState) {
  return (
    {
      draft: ["queued"],
      queued: ["rendering"],
      rendering: ["completed", "failed"],
      completed: [],
      failed: [],
    } as Record<RenderState, string[]>
  )[from].includes(to);
}

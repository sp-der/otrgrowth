"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import { z } from "zod";
import { strategySchema } from "@/lib/domain/schemas";
import { recordActivity, useWorkspace } from "@/components/workspace-provider";
import { StrategyView } from "@/components/strategy-view";
import { Feedback, PageHeader } from "@/components/ui";
const resultSchema = z.object({
  strategy: strategySchema,
  generatedAt: z.iso.datetime(),
});
const errorSchema = z.object({ code: z.string(), error: z.string() });
export default function Strategist() {
  const { data, business, update } = useWorkspace();
  const saved = data.strategies.find((s) => s.businessId === business.id);
  const stale =
    saved &&
    JSON.stringify(saved.profileSnapshot) !== JSON.stringify(business.profile);
  const [state, setState] = useState<
    "idle" | "generating" | "generated" | "unavailable" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  async function generate() {
    setState("generating");
    setMessage("");
    try {
      const response = await fetch("/api/ai/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(business.profile),
        signal: AbortSignal.timeout(55_000),
      });
      const raw: unknown = await response.json();
      if (!response.ok) {
        const parsed = errorSchema.safeParse(raw);
        const unavailable =
          parsed.success &&
          ["GATEWAY_NOT_CONFIGURED", "PROVIDER_UNAVAILABLE"].includes(
            parsed.data.code,
          );
        setState(unavailable ? "unavailable" : "error");
        setMessage(
          parsed.success
            ? parsed.data.error
            : "Strategy generation failed. Please retry.",
        );
        return;
      }
      const result = resultSchema.safeParse(raw);
      if (!result.success) {
        setState("error");
        setMessage(
          "The strategy response was malformed. Your previous strategy has been kept. Try again.",
        );
        return;
      }
      try {
        await update((w) =>
          recordActivity(
            {
              ...w,
              strategies: [
                ...w.strategies.filter((s) => s.businessId !== business.id),
                {
                  businessId: business.id,
                  profileSnapshot: business.profile,
                  ...result.data,
                },
              ],
            },
            business.id,
            "Marketing strategy generated from Business DNA",
          ),
        );
      } catch {
        setState("error");
        setMessage(
          "The strategy was generated but could not be saved. Check browser storage before trying again.",
        );
        return;
      }
      setState("generated");
      setMessage(
        "Strategy generated and saved. Review recommendations before acting on them.",
      );
    } catch {
      setState("unavailable");
      setMessage(
        "OTR Growth could not complete the AI request. Check the server and AI Gateway, then retry.",
      );
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CLARITY BEFORE CAMPAIGNS"
        title="Your next move, thought through."
        description="A practical marketing strategy built around your Business DNA."
        action={
          saved ? (
            <button
              disabled={state === "generating"}
              className="button primary"
              onClick={generate}
            >
              {state === "generating" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              {state === "generating" ? "Generating…" : "Regenerate Strategy"}
            </button>
          ) : undefined
        }
      />
      <div className="strategy-context">
        <div>
          <p>
            {business.profile.businessName}{" "}
            <span className="muted">
              / Client #{String(business.number).padStart(3, "0")}
            </span>
          </p>
          <small>
            Uses your saved Business DNA. No external accounts are accessed.
          </small>
        </div>
        <Link className="text-link" href="/business-dna">
          Review Business DNA <ArrowUpRight size={15} />
        </Link>
      </div>
      {stale && (
        <Feedback message="Your Business DNA has changed since this strategy was generated. Regenerate to use the updated profile." />
      )}
      <Feedback
        message={message}
        error={state === "unavailable" || state === "error"}
      />
      {state === "unavailable" && (
        <div className="analytics-note">
          <strong>AI Gateway setup needed</strong>
          <p>
            The rest of your workspace is ready to use. Configure the gateway on
            the OTR Growth server, then use Generate Strategy to retry.
          </p>
        </div>
      )}
      {!saved && (
        <section className="panel strategy-intro">
          <div>
            <Sparkles size={30} className="accent" strokeWidth={1.4} />
            <h2>
              Less blank-page thinking.
              <br />
              More business direction.
            </h2>
            <p>
              Turn what makes your business different into a focused, actionable
              30-day plan. Missing details are treated as unknowns, so your
              strategy stays grounded.
            </p>
            <button
              disabled={state === "generating"}
              className="button primary"
              onClick={generate}
            >
              {state === "generating" ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {state === "generating"
                ? "Generating strategy…"
                : "Generate Strategy"}
            </button>
            <p className="mt-4 text-xs" aria-live="polite">
              {state === "generating"
                ? "Working through your profile. This may take up to 45 seconds."
                : "Generated on demand. Nothing is published or launched."}
            </p>
          </div>
          <div className="strategy-includes">
            {[
              "Executive summary",
              "Ideal customer profiles",
              "Positioning & offers",
              "Content pillars",
              "Channel recommendations",
              "Campaign concepts",
              "30-day priorities",
              "Key metrics to track",
            ].map((s, i) => (
              <div key={s}>
                <span>0{i + 1}</span>
                {s}
              </div>
            ))}
          </div>
        </section>
      )}
      {saved && (
        <>
          <div className="section-line">
            <span className="eyebrow">YOUR MARKETING STRATEGY</span>
            <small>
              Generated{" "}
              {new Date(saved.generatedAt).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })}{" "}
              · review before use
            </small>
          </div>
          <StrategyView strategy={saved.strategy} />
        </>
      )}
    </>
  );
}

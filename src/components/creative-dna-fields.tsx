"use client";
import { creativeDNASchema, type CreativeDNA } from "@/lib/creative/schemas";
export function CreativeDNAFields({
  value,
  onChange,
}: {
  value?: CreativeDNA;
  onChange: (value: CreativeDNA) => void;
}) {
  const dna = creativeDNASchema.parse(value ?? {});
  return (
    <section className="form-section">
      <header>
        <p className="eyebrow">CREATIVE DNA</p>
        <h2>Video identity</h2>
        <p>
          Used by Creative Studio. Your brand voice and style above remain the
          creative direction.
        </p>
      </header>
      <div className="form-grid">
        {(["primaryColor", "secondaryColor", "accentColor"] as const).map(
          (k) => (
            <label className="field" key={k}>
              {k.replace("Color", " color")}
              <input
                type="color"
                value={dna[k]}
                onChange={(e) => onChange({ ...dna, [k]: e.target.value })}
              />
            </label>
          ),
        )}
        {(["headingFont", "bodyFont"] as const).map((k) => (
          <label className="field" key={k}>
            {k === "headingFont" ? "Heading font" : "Body font"}
            <select
              value={dna[k]}
              onChange={(e) =>
                onChange({
                  ...dna,
                  [k]: e.target.value as CreativeDNA[typeof k],
                })
              }
            >
              {["Arial", "Georgia", "Verdana"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="field full">
          Words to avoid (comma separated)
          <input
            value={dna.wordsToAvoid}
            onChange={(e) => onChange({ ...dna, wordsToAvoid: e.target.value })}
          />
        </label>
      </div>
    </section>
  );
}

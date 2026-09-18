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
          Controls how Creative Engine V2 plans motion, pacing, typography,
          footage, logos, CTAs and music.
        </p>
      </header>

      <div className="form-grid">
        {(["primaryColor", "secondaryColor", "accentColor"] as const).map((key) => (
          <label className="field" key={key}>
            {key.replace("Color", " color")}
            <input
              type="color"
              value={dna[key]}
              onChange={(event) =>
                onChange({ ...dna, [key]: event.target.value })
              }
            />
          </label>
        ))}

        {(["headingFont", "bodyFont"] as const).map((key) => (
          <label className="field" key={key}>
            {key === "headingFont" ? "Heading font" : "Body font"}
            <select
              value={dna[key]}
              onChange={(event) =>
                onChange({
                  ...dna,
                  [key]: event.target.value as CreativeDNA[typeof key],
                })
              }
            >
              {[
                "Arial",
                "Georgia",
                "Verdana",
                "Helvetica",
                "Trebuchet MS",
                ...(key === "headingFont" ? ["Impact"] : []),
              ].map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
        ))}

        <label className="field">
          Pacing
          <select
            value={dna.pacing}
            onChange={(event) =>
              onChange({ ...dna, pacing: event.target.value as CreativeDNA["pacing"] })
            }
          >
            {["Calm", "Balanced", "Fast"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Visual style
          <select
            value={dna.visualStyle}
            onChange={(event) =>
              onChange({
                ...dna,
                visualStyle: event.target.value as CreativeDNA["visualStyle"],
              })
            }
          >
            {["Clean", "Bold", "Luxury", "Editorial", "Playful", "Minimal"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Transition style
          <select
            value={dna.transitionStyle}
            onChange={(event) =>
              onChange({
                ...dna,
                transitionStyle: event.target.value as CreativeDNA["transitionStyle"],
              })
            }
          >
            {["Clean", "Punchy", "Cinematic", "Soft"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Motion intensity
          <select
            value={dna.motionIntensity}
            onChange={(event) =>
              onChange({
                ...dna,
                motionIntensity: event.target.value as CreativeDNA["motionIntensity"],
              })
            }
          >
            {["Subtle", "Balanced", "High"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="field">
          CTA style
          <select
            value={dna.ctaStyle}
            onChange={(event) =>
              onChange({
                ...dna,
                ctaStyle: event.target.value as CreativeDNA["ctaStyle"],
              })
            }
          >
            {["Button", "Minimal", "Bold", "Editorial"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Logo treatment
          <select
            value={dna.logoTreatment}
            onChange={(event) =>
              onChange({
                ...dna,
                logoTreatment: event.target.value as CreativeDNA["logoTreatment"],
              })
            }
          >
            {["Corner", "Center", "End card only", "Watermark"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>

        {[
          ["brandMood", "Brand mood"],
          ["preferredTextStyle", "Preferred text style"],
          ["musicVibe", "Music vibe"],
          ["footageStyle", "Footage style"],
          ["referenceAdNotes", "Reference ad notes"],
          ["wordsToFavor", "Words / phrases to favor"],
          ["wordsToAvoid", "Words / phrases to avoid"],
        ].map(([key, label]) => (
          <label className="field full" key={key}>
            {label}
            <textarea
              value={String(dna[key as keyof CreativeDNA] ?? "")}
              onChange={(event) =>
                onChange({
                  ...dna,
                  [key]: event.target.value,
                } as CreativeDNA)
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}

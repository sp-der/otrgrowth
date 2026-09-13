import type { Strategy } from "@/lib/domain/schemas";
const List = ({ items }: { items: string[] }) => (
  <ul>
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);
export function StrategyView({ strategy: s }: { strategy: Strategy }) {
  return (
    <div className="strategy-grid">
      <section className="strategy-block summary full">
        <p className="eyebrow">01 / EXECUTIVE SUMMARY</p>
        <h2>Your direction, defined.</h2>
        <p>{s.executiveSummary}</p>
      </section>
      <section className="strategy-block">
        <p className="eyebrow">02 / IDEAL CUSTOMERS</p>
        <h2>Who you’re here for</h2>
        {s.idealCustomerProfiles.map((p, i) => (
          <div key={i}>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <List items={p.painPoints} />
          </div>
        ))}
      </section>
      <section className="strategy-block">
        <p className="eyebrow">03 / POSITIONING</p>
        <h2>Your place in the market</h2>
        <p>{s.positioning}</p>
        <h3>Offer recommendations</h3>
        <List items={s.offerRecommendations} />
      </section>
      <section className="strategy-block full">
        <p className="eyebrow">04 / CONTENT PILLARS</p>
        <h2>What to show up and say</h2>
        <div className="strategy-grid">
          {s.contentPillars.map((p, i) => (
            <div key={i}>
              <h3>{p.name}</h3>
              <p>{p.purpose}</p>
              <List items={p.ideas} />
            </div>
          ))}
        </div>
      </section>
      <section className="strategy-block">
        <p className="eyebrow">05 / CHANNELS</p>
        <h2>Where to focus</h2>
        {s.channelRecommendations.map((c, i) => (
          <div key={i}>
            <h3>{c.channel}</h3>
            <p>{c.rationale}</p>
            <p className="mt-2">Cadence: {c.cadence}</p>
          </div>
        ))}
      </section>
      <section className="strategy-block">
        <p className="eyebrow">06 / CAMPAIGN CONCEPTS</p>
        <h2>Ideas with an objective</h2>
        {s.campaignConcepts.map((c, i) => (
          <div key={i}>
            <h3>{c.name}</h3>
            <p>{c.objective}</p>
            <p>{c.concept}</p>
            <p className="mt-2">CTA: {c.callToAction}</p>
          </div>
        ))}
      </section>
      <section className="strategy-block full">
        <p className="eyebrow">07 / THE NEXT 30 DAYS</p>
        <h2>Turn direction into action</h2>
        <div className="strategy-grid">
          {[...s.thirtyDayPriorities]
            .sort((a, b) => a.week - b.week)
            .map((p) => (
              <div key={p.week}>
                <h3>Week 0{p.week}</h3>
                <List items={p.actions} />
              </div>
            ))}
        </div>
      </section>
      <section className="strategy-block full">
        <p className="eyebrow">08 / MEASUREMENT</p>
        <h2>Know what’s working</h2>
        <div className="strategy-grid">
          {s.keyMetrics.map((m, i) => (
            <div key={i}>
              <h3>{m.name}</h3>
              <p>{m.reason}</p>
              <p className="mt-2">How to track: {m.measurement}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

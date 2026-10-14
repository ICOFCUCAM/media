/*
 * The production thread: the one motif the homepage returns to. The same six
 * stages run under the hero, open every act and number the production
 * journey, so each part of the page reads as a point on one film's way from
 * idea to audience.
 */

export const PRODUCTION_PATH = ["Idea", "Script", "Visualise", "Produce", "Final cut", "Distribute"] as const;

/** The thread with the stages from `from` to `to` (inclusive) lit. */
export function ProductionThread({ from, to, className = "" }: { from: number; to: number; className?: string }) {
  return (
    <ol className={`thread ${className}`} aria-label={`Production stages: ${PRODUCTION_PATH.slice(from, to + 1).join(", ")}`}>
      {PRODUCTION_PATH.map((s, i) => (
        <li key={s} className={i >= from && i <= to ? "is-lit" : undefined} aria-hidden>
          <i />
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** An act opening: "ACT II — The production", with the thread lit for the act's stages. */
export function ActHead({ n, name, from, to }: { n: string; name: string; from: number; to: number }) {
  return (
    <div className="act-head reveal">
      <div className="act-name">
        <span>Act {n}</span>
        <em>{name}</em>
      </div>
      <ProductionThread from={from} to={to} />
    </div>
  );
}

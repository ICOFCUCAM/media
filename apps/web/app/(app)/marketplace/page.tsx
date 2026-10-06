import Link from "next/link";
import { MARKETPLACE_CATEGORIES } from "../../../lib/products";
import { WaitlistButton } from "../../../components/WaitlistButton";
import { MarketplaceVoices } from "../../../components/MarketplaceVoices";
import { PageHeader, Section, Status } from "../../../components/cf/primitives";
import { CinemaArt, type Scene } from "../../../components/cf/CinemaArt";

/** How each catalogue is pictured until real listings fill it. */
const CATEGORY_SCENE: Record<string, Scene> = {
  films: "kingdom",
  characters: "figure",
  voices: "stage",
  worlds: "forest",
  templates: "studio",
};

export const metadata = { title: "Marketplace — Cineforge" };

/**
 * The Exchange (docs/design/exchange-marketplace.html). Today's live shelf is
 * community voices — offered from the Voice Room, approved by an admin. Paid
 * catalogues need listings, checkout and payouts, which have no backend yet;
 * they are shown as not open rather than as a working store.
 */
export default function MarketplacePage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Publishing / The exchange"
        title={<>The<br /><em>Exchange.</em></>}
        copy={
          <>
            <p>Turn what you make into a catalogue others can build with — voices first, then characters, worlds, films and templates.</p>
            <p><strong>Voices are exchanged today. Paid catalogues open when checkout and payouts are wired.</strong></p>
          </>
        }
        status={{ tone: "live", label: "Voice exchange open" }}
        aside={
          <Link href="/library/voices" className="cf-btn-ink mt-7">
            Offer a voice
          </Link>
        }
      />

      <MarketplaceVoices />

      <Section label="Catalogues" title="What the exchange will carry.">
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {MARKETPLACE_CATEGORIES.map((c, i) => {
            const open = c.id === "voices";
            return (
              <li key={c.id} className={`overflow-hidden rounded-lg border bg-cf-panel ${open ? "border-cf-accent" : "border-cf-line"}`}>
                <CinemaArt seed={`${c.name} ${c.blurb}`} scene={CATEGORY_SCENE[c.id]} className="aspect-[4/3]" hud={{ tag: String(i + 1).padStart(2, "0") }} />
                <div className="p-4">
                  <div className="font-display font-semibold text-[20px] tracking-[-0.02em]">{c.name}</div>
                  <p className="mt-2 min-h-[3.2em] text-[13px] leading-snug text-cf-muted">{c.blurb}</p>
                  <div className="mt-4">
                    {open ? <Status tone="live">Open · community</Status> : <WaitlistButton catalogue={c.id} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section label="Terms" title="How the exchange will pay.">
        <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-3">
          {[
            ["Creator split", "90% of every sale to the creator, once paid sales open."],
            ["Licensing", "Personal, commercial and extended licences carried with each asset."],
            ["Delivery", "Bought assets drop straight into the buyer's own productions."],
          ].map(([k, v]) => (
            <div key={k} className="min-h-[150px] bg-cf-bg p-6">
              <div className="cf-label">{k}</div>
              <p className="mt-8 font-display font-semibold text-[18px] leading-snug">{v}</p>
            </div>
          ))}
        </div>
        <p className="cf-label mt-4">Planned terms — no paid transactions run today.</p>
      </Section>
    </div>
  );
}

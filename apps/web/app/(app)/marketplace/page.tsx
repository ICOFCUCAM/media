import Link from "next/link";
import { MARKETPLACE_CATEGORIES } from "../../../lib/products";
import { MarketplaceVoices } from "../../../components/MarketplaceVoices";
import { PageHeader, Section, Status } from "../../../components/cf/primitives";

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
        <ol className="border-t border-cf-fg">
          {MARKETPLACE_CATEGORIES.map((c, i) => {
            const open = c.id === "voices";
            return (
              <li key={c.id} className="grid gap-3 border-b border-cf-line py-5 md:grid-cols-[44px_1fr_1.4fr_auto] md:items-center">
                <span className="font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display font-semibold text-[22px] tracking-[-0.02em]">{c.name}</span>
                <span className="text-[13px] text-cf-muted">{c.blurb}</span>
                <Status tone={open ? "live" : "idle"}>{open ? "Open · community" : "Not open yet"}</Status>
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

import { PageHeader, Section } from "../cf/primitives";

/** Permissions — the truthful access matrix: what each role can do TODAY,
 *  mapped to real enforcement (RLS owner policies, ADMIN role checks,
 *  tier gates). Informational by design until per-seat roles ship. */

const MATRIX: { capability: string; owner: boolean; producer: boolean; editor: boolean; viewer: boolean; admin: boolean; enforced: string }[] = [
  { capability: "Create films / trailers / shorts", owner: true, producer: true, editor: true, viewer: false, admin: true, enforced: "RLS: rows owned by creator" },
  { capability: "Spend credits (GPU generation)", owner: true, producer: true, editor: false, viewer: false, admin: true, enforced: "worker credit gate" },
  { capability: "Publish to social platforms", owner: true, producer: true, editor: false, viewer: false, admin: true, enforced: "launch requires owner row" },
  { capability: "Clone voices / create avatars", owner: true, producer: true, editor: true, viewer: false, admin: true, enforced: "RLS owner" },
  { capability: "Offer voices to community", owner: true, producer: false, editor: false, viewer: false, admin: true, enforced: "share flow" },
  { capability: "Approve community voices", owner: false, producer: false, editor: false, viewer: false, admin: true, enforced: "users.role = ADMIN policy" },
  { capability: "Manage team & brand kit", owner: true, producer: false, editor: false, viewer: false, admin: true, enforced: "RLS owner" },
  { capability: "Billing & plan changes", owner: true, producer: false, editor: false, viewer: false, admin: true, enforced: "Stripe checkout (JWT)" },
  { capability: "View analytics", owner: true, producer: true, editor: true, viewer: true, admin: true, enforced: "RLS owner reads" },
];

const ROLE_COLS = ["Owner", "Producer", "Editor", "Viewer", "Admin"] as const;

export function PermissionsPage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Enterprise / Permissions"
        title={<>Who may<br /><em>do what.</em></>}
        copy={
          <>
            <p>What each role can do, and where it is enforced — row-level security, admin role checks and plan gates.</p>
            <p><strong>Owner and Admin are live today; Producer, Editor and Viewer activate as team members accept invites.</strong></p>
          </>
        }
        status={{ tone: "live", label: "Owner · Admin enforced" }}
      />

      <Section label="Access matrix" title="Capabilities.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-t border-cf-fg text-left">
            <caption className="sr-only">Capabilities by role and where each is enforced</caption>
            <thead>
              <tr className="border-b border-cf-line">
                <th scope="col" className="cf-label py-4 pr-4 font-normal">Capability</th>
                {ROLE_COLS.map((h) => (
                  <th key={h} scope="col" className="cf-label px-3 py-4 text-center font-normal">
                    {h}
                  </th>
                ))}
                <th scope="col" className="cf-label py-4 pl-4 font-normal">Enforced by</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((r) => (
                <tr key={r.capability} className="border-b border-cf-line">
                  <th scope="row" className="py-4 pr-4 text-left font-serif text-[17px] font-normal">{r.capability}</th>
                  {[r.owner, r.producer, r.editor, r.viewer, r.admin].map((v, i) => (
                    <td key={i} className="px-3 py-4 text-center">
                      {v ? (
                        <span className="inline-block h-2 w-2 rounded-full bg-cf-fg" aria-label="Allowed" />
                      ) : (
                        <span className="text-cf-dim" aria-label="Not allowed">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="py-4 pl-4 font-mono text-[10px] text-cf-muted">{r.enforced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

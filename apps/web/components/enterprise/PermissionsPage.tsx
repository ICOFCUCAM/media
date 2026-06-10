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

export function PermissionsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="mt-1 text-sm text-white/55">
          What each role can do, and where it's enforced. Owner/Admin are live today; per-seat Producer/Editor/Viewer
          activate as team members accept invites.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-2.5 font-medium">Capability</th>
              {["Owner", "Producer", "Editor", "Viewer", "Admin"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-center font-medium">{h}</th>
              ))}
              <th className="px-4 py-2.5 font-medium">Enforced by</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((r) => (
              <tr key={r.capability} className="border-t border-white/5">
                <td className="px-4 py-2.5 text-white/75">{r.capability}</td>
                {[r.owner, r.producer, r.editor, r.viewer, r.admin].map((v, i) => (
                  <td key={i} className="px-3 py-2.5 text-center">
                    {v ? <span className="text-emerald-300">✓</span> : <span className="text-white/15">—</span>}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-[11px] text-white/40">{r.enforced}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

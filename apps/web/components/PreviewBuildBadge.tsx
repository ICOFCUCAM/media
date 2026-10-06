/**
 * Marks Vercel *preview* deployments (docs/36 §9). Old preview URLs stay
 * reachable, so a reviewer can land on a stale build and mistake it for the
 * live site. On previews this shows which commit is running and links to the
 * production site; production and local builds render nothing.
 */
export function PreviewBuildBadge() {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "";
  const live = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (
    <div
      role="note"
      className="fixed right-2 top-[70px] z-[200] flex max-w-[calc(100vw-16px)] items-center gap-2 rounded-full border border-[#ecba48]/60 bg-[#151309]/95 px-3 py-1.5 text-[11px] font-medium text-[#ecba48] shadow-lg backdrop-blur lg:bottom-3 lg:left-3 lg:right-auto lg:top-auto"
    >
      <span className="truncate">
        Preview build{sha ? ` · ${sha}` : ""}
        {branch ? ` · ${branch}` : ""}
      </span>
      {live && (
        <a href={live} className="shrink-0 underline underline-offset-2 hover:text-white">
          Live site →
        </a>
      )}
    </div>
  );
}

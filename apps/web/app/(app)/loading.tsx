/** Shown while a studio route's server segment streams in; the shell stays put. */
export default function StudioLoading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14" aria-busy="true">
      <div className="border-b border-cf-line pb-14">
        <div className="h-3 w-40 animate-pulse bg-cf-soft" />
        <div className="mt-8 h-[clamp(52px,7.5vw,128px)] w-2/3 animate-pulse bg-cf-soft" />
        <div className="mt-4 h-[clamp(52px,7.5vw,128px)] w-1/2 animate-pulse bg-cf-soft" />
      </div>
      <p className="cf-label mt-10">Opening the room…</p>
    </div>
  );
}

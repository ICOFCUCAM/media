/** Consistent section heading with an eyebrow label + optional sheen accent. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center = true,
  sheen,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
  sheen?: string;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      {eyebrow && (
        <p className={`mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-300/80 ${center ? "justify-center" : ""}`}>
          <span className="h-1 w-6 rounded-full bg-indigo-400/50" />
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-semibold sm:text-4xl">
        {sheen ? (
          <>
            {title.replace(sheen, "")}
            <span className="cf-sheen bg-[linear-gradient(110deg,#a5b4fc,40%,#f0abfc,60%,#67e8f9)] bg-clip-text text-transparent">{sheen}</span>
          </>
        ) : (
          title
        )}
      </h2>
      {subtitle && <p className={`mt-3 max-w-2xl text-sm text-white/55 ${center ? "mx-auto" : ""}`}>{subtitle}</p>}
    </div>
  );
}

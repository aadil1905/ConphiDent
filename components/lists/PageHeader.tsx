/**
 * The standard page top: 22px h1, one line of context, actions on the right.
 * It is screen furniture — printed output (bills, prescriptions, the huddle
 * brief) carries its own heading, so this one stays off the paper.
 */
export default function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 print:hidden">
      <div className="min-w-0">
        {/* -0.02em, matching the h1–h4 rule in globals.css. This was -0.01em, a
            utility, so it outranked that rule and every page title in the
            workspace kept the tracking the retired serif wanted rather than the
            one Plus Jakarta Sans wants at 30px. */}
        <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.02em] text-heading">
          {title}
        </h1>
        {sub && (
          <p className="mt-1.5 max-w-[65ch] text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            {sub}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

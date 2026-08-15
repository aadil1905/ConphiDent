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
    <header className="flex flex-wrap items-start justify-between gap-3 print:hidden">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-bold text-heading">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

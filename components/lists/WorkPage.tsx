import PageHeader from "./PageHeader";

/**
 * The one shape every working screen has: a 22px page header, a main column
 * that fills the shell, and an optional sticky rail for the context you need
 * while you work. Pages must not add their own `mx-auto max-w-*` — the shell
 * already caps content at 107.5rem, and a second cap is what leaves half the
 * screen empty.
 */
export default function WorkPage({
  title,
  sub,
  actions,
  aside,
  children,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  /** Rendered in a sticky right-hand rail from xl up. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={title} sub={sub} actions={actions} />
      {aside ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">{children}</div>
          <aside className="flex flex-col gap-3 xl:sticky xl:top-[104px]">{aside}</aside>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      )}
    </div>
  );
}

/** A card for the rail — same language as every other card in the product. */
export function RailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
      <h2 className="text-[13px] font-semibold text-heading">{title}</h2>
      {children}
    </section>
  );
}

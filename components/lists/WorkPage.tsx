import PageHeader from "./PageHeader";

/**
 * The one shape every working screen has: a 22px page header, then full-width
 * cards stacked down the page. Nothing sits in a side column — a short card
 * beside a long form leaves half the screen empty, so cards take the whole
 * width and the next one goes underneath.
 *
 * Pages must not add their own `mx-auto max-w-*`; the shell already caps
 * content at 107.5rem and a second cap is what left the margins bare.
 */
export default function WorkPage({
  title,
  sub,
  actions,
  context,
  children,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  /** Cards shown above the work — who this is for, what to read first. */
  context?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={title} sub={sub} actions={actions} />
      {context}
      {children}
    </div>
  );
}

/**
 * A full-width card. Its rows lay themselves out across the width instead of
 * stacking in a narrow strip, so a card with three facts reads as one line
 * rather than three.
 */
export function RailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
      <h2 className="text-[13px] font-semibold text-heading">{title}</h2>
      <div className="mt-2 grid gap-x-8 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        {children}
      </div>
    </section>
  );
}

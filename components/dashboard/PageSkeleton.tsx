/**
 * Loading states shaped like the page they stand in for, so nothing jumps when
 * the real content lands. Never a full-page spinner.
 */

function Bar({ w, h = "h-4" }: { w: string; h?: string }) {
  return <div className={`${h} ${w} animate-pulse rounded bg-muted`} />;
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Bar w="w-44" h="h-6" />
        <Bar w="w-72" h="h-3.5" />
      </div>
      <div className="h-11 w-32 animate-pulse rounded-control bg-muted" />
    </div>
  );
}

function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
          <Bar w="w-24" h="h-3" />
          <Bar w="w-20" h="h-7" />
          <Bar w="w-32" h="h-3" />
        </div>
      ))}
    </div>
  );
}

function RowsSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
      <div className="flex gap-4 border-b border-border bg-muted px-4.5 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="h-3 flex-1 animate-pulse rounded bg-border-strong/40" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-border/70 px-4.5 py-3.5 last:border-b-0">
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-4 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </section>
  );
}

function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <section key={index} className="flex flex-col gap-3 rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
          <Bar w="w-40" h="h-5" />
          <Bar w="w-full" />
          <Bar w="w-4/5" />
          <Bar w="w-2/3" />
        </section>
      ))}
    </>
  );
}

/**
 * The one loading component. `shape` matches the destination:
 * - "list": search + filters + table (Patients, Money, Schedule…)
 * - "board": tiles + queue cards (Today, Insights, Stock)
 * - "detail": header + stacked cards (Patient 360, Settings, forms)
 * - "split": list pane + reading pane (Messages)
 */
export default function PageSkeleton({
  shape = "list",
}: {
  shape?: "list" | "board" | "detail" | "split";
}) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-5">
      <HeaderSkeleton />

      {shape === "list" && (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
            <div className="h-11 flex-[1_1_240px] animate-pulse rounded-control bg-muted" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-11 w-28 animate-pulse rounded-control bg-muted" />
            ))}
          </section>
          <RowsSkeleton />
        </>
      )}

      {shape === "board" && (
        <>
          <TilesSkeleton />
          <CardsSkeleton count={2} />
        </>
      )}

      {shape === "detail" && <CardsSkeleton count={3} />}

      {shape === "split" && (
        <div className="grid min-h-[60vh] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 shadow-[var(--shadow)]">
            <div className="h-11 w-full animate-pulse rounded-control bg-muted" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2.5">
                <div className="h-9 w-9 flex-none animate-pulse rounded-pill bg-muted" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Bar w="w-3/5" h="h-3.5" />
                  <Bar w="w-4/5" h="h-3" />
                </div>
              </div>
            ))}
          </section>
          <section className="rounded-card border border-border bg-card shadow-[var(--shadow)]" />
        </div>
      )}
    </div>
  );
}

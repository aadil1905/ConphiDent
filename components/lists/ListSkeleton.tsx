/** Shaped like the table it replaces, so nothing jumps when the rows land. */
export default function ListSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading the list"
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]"
    >
      <div className="flex gap-4 border-b border-border bg-muted px-4 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="h-3 flex-1 animate-pulse rounded bg-border-strong/40" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 border-b border-border/70 px-4 py-3.5 last:border-b-0">
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-4 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </section>
  );
}

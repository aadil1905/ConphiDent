import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * One line of explanation, an icon, and a primary action. Never "No data" —
 * and when a queue is genuinely clear, say so warmly.
 */
export default function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
      <span aria-hidden className="grid size-12 place-items-center rounded-card bg-muted text-text-muted">
        <Icon className="h-6 w-6" strokeWidth={1.7} />
      </span>
      <p className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</p>
      <p className="max-w-[42ch] text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

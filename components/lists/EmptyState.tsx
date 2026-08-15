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
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="h-7 w-7 text-text-muted" strokeWidth={1.6} aria-hidden />
      <p className="text-[15px] font-semibold text-heading">{title}</p>
      <p className="max-w-[32rem] text-[13px] text-text-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

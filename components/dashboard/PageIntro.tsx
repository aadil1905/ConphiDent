import type { ReactNode } from "react";

type PageIntroProps = {
  /** Kept for callers that still pass it; Phase B headers do not show an eyebrow. */
  eyebrow?: string;
  title: string;
  description: ReactNode;
  descriptionMarginClassName?: "mt-1" | "mt-2";
};

/** Thin wrapper so older pages land on the same header as everything else.
    The docstring used to promise that while rendering 22px bold — a size and
    weight no other page title in the workspace has. Now it is true: the same
    --text-page treatment PageHeader draws. */
export default function PageIntro({ title, description }: PageIntroProps) {
  return (
    <header className="min-w-0">
      <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold text-heading">{title}</h1>
      <p className="mt-1.5 max-w-[65ch] text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{description}</p>
    </header>
  );
}

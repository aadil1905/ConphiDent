import type { ReactNode } from "react";

type PageIntroProps = {
  /** Kept for callers that still pass it; Phase B headers do not show an eyebrow. */
  eyebrow?: string;
  title: string;
  description: ReactNode;
  descriptionMarginClassName?: "mt-1" | "mt-2";
};

/** Thin wrapper so older pages land on the same header as everything else. */
export default function PageIntro({ title, description }: PageIntroProps) {
  return (
    <header className="min-w-0">
      <h1 className="text-[22px] leading-tight font-bold text-heading">{title}</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-text-muted">{description}</p>
    </header>
  );
}

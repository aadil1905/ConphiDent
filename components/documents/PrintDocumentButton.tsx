"use client";

/**
 * Prints the page you are already on.
 *
 * Not a link to a sheet in another tab: the A4 template lives on this same
 * route inside a `hidden print:block` wrapper, so the browser's print job
 * picks it up and the screen view is left behind. Nothing to navigate to,
 * nothing to navigate back from.
 */
export default function PrintDocumentButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover print:hidden"
    >
      {label}
    </button>
  );
}

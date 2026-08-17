import { Loader2 } from "lucide-react";

/**
 * What a button says while it is working. It was six different things: five
 * forms swapped the label and nothing else, one drew a spinner, and a screen
 * reader was told nothing at all on any of them. Pair it with `aria-busy` on
 * the button so the spin is announced and not just seen.
 */
export default function Pending({ label }: { label: string }) {
  return (
    <>
      <Loader2 className="size-4 flex-none animate-spin" aria-hidden />
      {label}
    </>
  );
}

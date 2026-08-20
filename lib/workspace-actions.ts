/**
 * The things the workspace can start, as opposed to find. Shared so the ⌘K
 * palette and the Find anything page offer exactly the same list — two lists
 * that drift apart is how one of them ends up pointing at a dead route.
 */
export type WorkspaceAction = {
  kind: "Action";
  title: string;
  detail: string;
  href: string;
  hint: string;
};

export const WORKSPACE_ACTIONS: WorkspaceAction[] = [
  { kind: "Action", title: "Book a visit", detail: "Opens the booking sheet on Schedule", href: "/dashboard/appointments/new", hint: "Run" },
  { kind: "Action", title: "Add a patient", detail: "Register a walk-in in four fields", href: "/dashboard/patients?add=1", hint: "Run" },
  { kind: "Action", title: "New invoice", detail: "Bill the patient in the chair", href: "/dashboard/billing/new", hint: "Run" },
  { kind: "Action", title: "Log an enquiry", detail: "Someone who just called", href: "/dashboard/growth?log=1", hint: "Run" },
  { kind: "Action", title: "Start charting", detail: "Open the clinical workspace for a patient", href: "/dashboard/clinical-workspace", hint: "Run" },
];

/** Where the palette keeps what you opened last, read by Find anything too. */
export const RECENT_KEY = "conphident.palette.recent";
export const MAX_RECENT = 6;

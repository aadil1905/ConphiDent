/** What the schedule calls each state, and what the database calls it. */
export const STATUS_LABELS: Record<string, string> = {
  Pending: "Not confirmed",
  Confirmed: "Confirmed",
  Completed: "Seen",
  Cancelled: "Cancelled",
  "No-show": "No show",
};

export const STATUS_VALUES = Object.keys(STATUS_LABELS);

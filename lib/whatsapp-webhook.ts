export type NormalizedWebhookMessage = {
  phoneNumberId?: string;
  message: Record<string, unknown>;
};

export type NormalizedWebhookStatus = {
  id?: string;
  status?: string;
  errors?: { title?: string }[];
};

export type NormalizedWebhookEvent = {
  phoneNumberId?: string;
  messages: NormalizedWebhookMessage[];
  statuses: NormalizedWebhookStatus[];
};

/** Flatten Meta's nested entry/change payload without discarding later events. */
export function normalizeWhatsAppWebhook(body: unknown): NormalizedWebhookEvent[] {
  if (!body || typeof body !== "object" || !("entry" in body) || !Array.isArray(body.entry)) return [];
  return body.entry.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !("changes" in entry) || !Array.isArray(entry.changes)) return [];
    const changes: unknown[] = entry.changes;
    return changes.flatMap((change) => {
      const value = change && typeof change === "object" && "value" in change && change.value && typeof change.value === "object" ? change.value as Record<string, unknown> : null;
      if (!value) return [];
      const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata as Record<string, unknown> : {};
      const phoneNumberId = typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : undefined;
      const rawMessages = Array.isArray(value.messages) ? value.messages : [];
      const rawStatuses = Array.isArray(value.statuses) ? value.statuses : [];
      return [{
        phoneNumberId,
        messages: rawMessages.filter((message): message is Record<string, unknown> => Boolean(message && typeof message === "object")).map((message) => ({ phoneNumberId, message })),
        statuses: rawStatuses.filter((status): status is NormalizedWebhookStatus => Boolean(status && typeof status === "object")),
      }];
    });
  });
}

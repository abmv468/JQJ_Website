const alertedEventIds = new Set<string>();

export interface NullRowAlertDecision {
  alert: boolean;
  /**
   * `event_id` remembers the provider event id in this process so a redelivery
   * does not send again. `once_per_invocation` means there is no event id to
   * remember, so this call alerts and the next call will too.
   */
  dedupe: "event_id" | "once_per_invocation";
}

/**
 * Dedupe for the webhook branch that has no payment_webhook_events row.
 * A conditional UPDATE cannot run there. The provider event id, when present,
 * is remembered for this process only. Without an id, alert once per invocation.
 */
export function claimNullRowAlert(eventId: string | null): NullRowAlertDecision {
  if (!eventId) {
    return { alert: true, dedupe: "once_per_invocation" };
  }
  if (alertedEventIds.has(eventId)) {
    return { alert: false, dedupe: "event_id" };
  }
  alertedEventIds.add(eventId);
  return { alert: true, dedupe: "event_id" };
}

export function resetNullRowAlertDedupe() {
  alertedEventIds.clear();
}

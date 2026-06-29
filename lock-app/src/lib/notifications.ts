/**
 * Pure helpers for the in-app notification bell. Until the Alerts engine exists,
 * "notifications" are EventLog rows whose detail.outcome is warning|failed. The
 * page reads those rows (scoped to the user's properties) and the user's
 * notificationsSeenAt, then feeds plain objects in here. Delivery (email) is
 * deferred — this is read-only surfacing.
 */
export interface NotificationItem {
  id: string;
  message: string;
  outcome: "warning" | "failed";
  createdAt: Date;
  roomId: string | null;
  propertyId: string;
}

export function isAlertEvent(outcome: string | undefined): boolean {
  return outcome === "warning" || outcome === "failed";
}

/**
 * Whether an EventLog row belongs in the notification BELL. An alert (warning|
 * failed) qualifies UNLESS it's a code-reveal action (`code_revealed`,
 * `backup_code_revealed`): reveals are routine, intentional admin actions logged
 * as warnings for the audit trail — they belong in the Activity log, not the bell.
 */
export function isBellEvent(action: string | undefined, outcome: string | undefined): boolean {
  if (!isAlertEvent(outcome)) return false;
  return !(action ?? "").includes("reveal");
}

export function unseenCount(items: NotificationItem[], seenAt: Date | null): number {
  if (!seenAt) return items.length;
  return items.filter((i) => i.createdAt > seenAt).length;
}

export function recentNotifications(items: NotificationItem[], limit: number): NotificationItem[] {
  return [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

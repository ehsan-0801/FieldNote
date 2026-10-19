/** Every audit action the application writes, with the phrase the timeline shows. */
export const AUDIT_ACTIONS = {
  "work_order.created": "filed the report",
  "work_order.updated": "edited details",
  "work_order.priority_confirmed": "confirmed priority",
  "work_order.assigned": "changed the owner",
  "work_order.status_changed": "changed status",
  "work_order.note_added": "added a note",
  "work_order.ai_extraction": "drafted structure from the note",
  "user.created": "created an account",
  "user.updated": "updated an account",
  "user.role_changed": "changed a role",
  "user.password_reset": "reset a password",
  "user.deactivated": "deactivated an account",
  "user.reactivated": "reactivated an account",
  "category.created": "added a category",
  "category.updated": "updated a category",
  "ai_provider.created": "added an AI provider",
  "ai_provider.updated": "updated an AI provider",
  "ai_provider.deleted": "deleted an AI provider",
  "ai_provider.activated": "switched AI to a workspace provider",
  "ai_provider.deactivated": "switched AI to the environment default",
  "ai_provider.tested": "tested an AI provider",
  "auth.login": "signed in",
  "auth.login_failed": "failed to sign in",
  "auth.logout": "signed out",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;
export type AuditEntityType = "WorkOrder" | "User" | "Category" | "Session" | "AiProviderConfig";

export const WORK_ORDER_HISTORY_ENTITIES: readonly AuditEntityType[] = ["WorkOrder", "Category"];

export function isAuditAction(action: string): action is AuditAction {
  return Object.hasOwn(AUDIT_ACTIONS, action);
}

export function auditActionLabel(action: string): string {
  return isAuditAction(action) ? AUDIT_ACTIONS[action] : action;
}

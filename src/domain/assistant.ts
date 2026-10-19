import { z } from "zod";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";

export const ASSISTANT_TOOLS = [
  "none",
  "search_work_orders",
  "get_work_order",
  "get_overview",
  "list_technicians",
  "list_categories",
  "recent_activity",
  "workload",
  "my_work_orders",
] as const;
export const PROPOSAL_ACTIONS = ["none", "assign", "change_status", "add_note", "create_report"] as const;

/**
 * One step from the model. Every field is always present (empty string when unused)
 * so the same shape works with strict structured output on every provider.
 */
export const assistantStepSchema = z.strictObject({
  step: z.enum(["tool", "answer"]),
  tool: z.enum(ASSISTANT_TOOLS),
  query: z.string().max(200),
  reference: z.string().max(20),
  status: z.string().max(20),
  reply: z.string().max(4000),
  proposal: z.strictObject({
    action: z.enum(PROPOSAL_ACTIONS),
    reference: z.string().max(20),
    technicianName: z.string().max(80),
    toStatus: z.string().max(20),
    text: z.string().max(2000),
    location: z.string().max(120),
  }),
});
export type AssistantStep = z.infer<typeof assistantStepSchema>;

/** A suggested action after server-side validation; stored on the message and executed only on confirm. */
export const storedProposalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), workOrderId: z.string(), reference: z.string(), assigneeId: z.string(), assigneeName: z.string() }),
  z.object({
    type: z.literal("change_status"),
    workOrderId: z.string(),
    reference: z.string(),
    toStatus: z.enum(WorkOrderStatus),
    text: z.string().max(2000),
  }),
  z.object({ type: z.literal("add_note"), workOrderId: z.string(), reference: z.string(), body: z.string().min(2).max(2000) }),
  z.object({ type: z.literal("create_report"), report: z.string().min(12).max(4000), location: z.string().max(120).nullable() }),
]);
export type StoredProposal = z.infer<typeof storedProposalSchema>;

export const storedLinksSchema = z.array(z.object({ reference: z.string(), workOrderId: z.string() })).max(20);

export const sendMessageSchema = z.strictObject({
  conversationId: z.string().trim().min(1).max(40).optional(),
  content: z.string().trim().min(1, { error: "Write a message first." }).max(2000, { error: "Keep messages under 2000 characters." }),
});

export const actionDecisionSchema = z.strictObject({ decision: z.enum(["confirm", "dismiss"]) });

export const REFERENCE_PATTERN = /\bWO-\d{3,7}\b/g;

/** Whose work a workload lookup covers, so the model can say which numbers it is quoting. */
export type WorkloadScope = "workspace" | "assignedToMe" | "reportedByMe";

/** Managers see the whole workspace, technicians their own queue, everyone else their own reports. */
export function workloadScope(role: Role): WorkloadScope {
  if (role === Role.ADMIN || role === Role.COORDINATOR) return "workspace";
  if (role === Role.TECHNICIAN) return "assignedToMe";
  return "reportedByMe";
}

export interface WorkloadRow {
  status: WorkOrderStatus;
  ownerName: string | null;
  count: number;
}

/** Folds grouped counts into per-status and per-owner totals; owners sorted by most open work first. */
export function summarizeWorkload(rows: readonly WorkloadRow[]) {
  const byStatus: Partial<Record<WorkOrderStatus, number>> = {};
  const owners = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    total += row.count;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + row.count;
    const owner = row.ownerName ?? "Unassigned";
    owners.set(owner, (owners.get(owner) ?? 0) + row.count);
  }
  const byOwner = [...owners].map(([owner, open]) => ({ owner, open })).sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner));
  return { total, byStatus, byOwner };
}

import { z } from "zod";
import { Priority, Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { PRIORITY_LABEL } from "@/domain/priority";
import { STATUS_LABEL } from "@/domain/workflow";

const person = z.object({ id: z.string(), name: z.string() }).nullable();
const statusChange = z.object({ from: z.enum(WorkOrderStatus), to: z.enum(WorkOrderStatus), reason: z.string().optional() });
const assignment = z.object({ from: person, to: person, reason: z.string().optional() });
const priorityChange = z.object({ priority: z.object({ from: z.enum(Priority), to: z.enum(Priority) }), score: z.number() });
const detailChange = z.object({ changes: z.record(z.string(), z.unknown()) });
const noteAdded = z.object({ kind: z.enum(["COMMENT", "PROGRESS", "RESOLUTION"]) });
const aiRun = z.object({ provider: z.string(), status: z.enum(["SUCCEEDED", "FALLBACK"]), errorCode: z.string().nullable() });
const roleChange = z.object({ from: z.enum(Role), to: z.enum(Role) });

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  summary: "summary",
  categoryId: "category",
  locationLabel: "location",
  assetLabel: "asset",
};

const NOTE_LABEL = { COMMENT: "Comment", PROGRESS: "Progress note", RESOLUTION: "Resolution note" } as const;
const ROLE_NAME: Record<Role, string> = {
  ADMIN: "Administrator",
  COORDINATOR: "Coordinator",
  TECHNICIAN: "Technician",
  REPORTER: "Reporter",
};

/** Turns stored audit JSON into one readable line. Unknown shapes return null rather than raw JSON. */
export function describeAuditDetails(action: string, details: unknown): string | null {
  switch (action) {
    case "work_order.status_changed": {
      const parsed = statusChange.safeParse(details);
      if (!parsed.success) return null;
      const line = `${STATUS_LABEL[parsed.data.from]} → ${STATUS_LABEL[parsed.data.to]}`;
      return parsed.data.reason ? `${line}: “${parsed.data.reason}”` : line;
    }
    case "work_order.assigned": {
      const parsed = assignment.safeParse(details);
      if (!parsed.success) return null;
      const { from, to, reason } = parsed.data;
      const line = to ? `Assigned to ${to.name}${from ? ` (was ${from.name})` : ""}` : `Unassigned${from ? ` from ${from.name}` : ""}`;
      return reason ? `${line}. ${reason}` : line;
    }
    case "work_order.priority_confirmed": {
      const parsed = priorityChange.safeParse(details);
      return parsed.success ? `${PRIORITY_LABEL[parsed.data.priority.to]} (score ${parsed.data.score})` : null;
    }
    case "work_order.updated": {
      const changed = detailChange.safeParse(details);
      if (changed.success) {
        const fields = Object.keys(changed.data.changes).map((field) => FIELD_LABEL[field] ?? field);
        return fields.length ? `Changed ${fields.join(", ")}` : null;
      }
      const proposed = priorityChange.safeParse(details);
      return proposed.success ? `Proposed priority ${PRIORITY_LABEL[proposed.data.priority.to]} (score ${proposed.data.score})` : null;
    }
    case "work_order.note_added": {
      const parsed = noteAdded.safeParse(details);
      return parsed.success ? NOTE_LABEL[parsed.data.kind] : null;
    }
    case "work_order.ai_extraction": {
      const parsed = aiRun.safeParse(details);
      if (!parsed.success) return null;
      if (parsed.data.status === "SUCCEEDED") return `Suggestions from ${parsed.data.provider}`;
      return `Rule-based draft${parsed.data.errorCode ? ` (${parsed.data.errorCode.toLowerCase().replaceAll("_", " ")})` : ""}`;
    }
    case "user.role_changed": {
      const parsed = roleChange.safeParse(details);
      return parsed.success ? `${ROLE_NAME[parsed.data.from]} → ${ROLE_NAME[parsed.data.to]}` : null;
    }
    default:
      return null;
  }
}

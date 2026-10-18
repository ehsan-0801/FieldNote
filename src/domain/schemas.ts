import { z } from "zod";
import { NoteKind, Priority, Role, WorkOrderStatus } from "@/generated/prisma/enums";

/**
 * Request schemas for every trust boundary. Objects are strict: unknown keys such
 * as `role`, `workspaceId` or `reporterId` are rejected rather than ignored, so a
 * crafted payload fails loudly instead of being half-applied.
 */

const optionalLabel = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const REPORT_MAX_LENGTH = 4000;

export const createWorkOrderSchema = z.strictObject({
  originalReport: z
    .string()
    .trim()
    .min(12, { error: "Describe the issue in at least a sentence." })
    .max(REPORT_MAX_LENGTH, { error: `Keep the report under ${REPORT_MAX_LENGTH} characters.` }),
  locationLabel: optionalLabel(120),
  assetLabel: optionalLabel(120),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const priorityFactorsSchema = z.strictObject({
  safetyFlag: z.boolean(),
  essentialServiceDown: z.boolean(),
  multiplePeopleAffected: z.boolean(),
  worsening: z.boolean(),
});

export const updateWorkOrderSchema = z
  .strictObject({
    title: z.string().trim().min(3, { error: "Give the work order a short title." }).max(100).optional(),
    summary: z.string().trim().max(600).nullable().optional(),
    categoryId: z.string().trim().min(1).max(40).nullable().optional(),
    locationLabel: optionalLabel(120),
    assetLabel: optionalLabel(120),
    factors: priorityFactorsSchema.optional(),
    assigneeId: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: "Nothing to update." });
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;

export const transitionSchema = z.strictObject({
  toStatus: z.enum(WorkOrderStatus),
  reason: z.string().trim().max(500).optional(),
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const noteSchema = z.strictObject({
  body: z.string().trim().min(2, { error: "Write a note first." }).max(2000),
  kind: z.enum([NoteKind.COMMENT, NoteKind.PROGRESS]).default(NoteKind.COMMENT),
});
export type NoteInput = z.infer<typeof noteSchema>;

export const parseReportSchema = z.strictObject({
  workOrderId: z.string().trim().min(1).max(40),
});

export const WORK_ORDER_SORTS = ["updated", "created", "priority"] as const;
export const PAGE_SIZES = [10, 25, 50] as const;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const emptyToUndefined = (value: unknown) => {
  const first = firstValue(value);
  return first === "" || first === null ? undefined : first;
};

/** Query-string filters. Unknown parameters are ignored; known ones are allow-listed. */
export const workOrderListQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(WorkOrderStatus).optional()),
  priority: z.preprocess(emptyToUndefined, z.enum(Priority).optional()),
  category: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  owner: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(WORK_ORDER_SORTS).default("updated")),
  dir: z.preprocess(emptyToUndefined, z.enum(["asc", "desc"]).default("desc")),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .refine((n): n is (typeof PAGE_SIZES)[number] => PAGE_SIZES.some((size) => size === n))
      .default(25),
  ),
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;

export const loginSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .pipe(z.email({ error: "Enter the email you sign in with." })),
  password: z.string().min(1, { error: "Enter your password." }).max(200),
});

export const PASSWORD_MIN_LENGTH = 12;

export const createUserSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .pipe(z.email({ error: "Enter a valid email address." })),
  role: z.enum(Role),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
    .max(128),
});

export const updateUserSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(80).optional(),
    role: z.enum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: "Nothing to update." });

export const createCategorySchema = z.strictObject({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
});

export const updateCategorySchema = z
  .strictObject({
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(200).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: "Nothing to update." });

export const auditQuerySchema = z.object({
  action: z.preprocess(emptyToUndefined, z.string().max(60).optional()),
  actor: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  entity: z.preprocess(emptyToUndefined, z.enum(["WorkOrder", "User", "Category", "Session"]).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

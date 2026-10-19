import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { canManageWorkspace, type Actor } from "@/domain/access";
import { DomainError } from "@/domain/errors";
import { slugify, type createCategorySchema, type updateCategorySchema } from "@/domain/schemas";
import { recordAudit } from "../audit";
import { MAX_OPTIONS } from "../work-orders/queries";
import { db } from "../db";
import type { ActorContext } from "../request-context";

function assertAdmin(actor: Actor) {
  if (!canManageWorkspace(actor)) throw new DomainError("FORBIDDEN", "Only administrators can manage categories.");
}

export async function listCategories(actor: Actor) {
  assertAdmin(actor);
  return db.category.findMany({
    where: { workspaceId: actor.workspaceId },
    select: { id: true, name: true, slug: true, description: true, isActive: true, _count: { select: { workOrders: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: MAX_OPTIONS,
  });
}

export async function createCategory(ctx: ActorContext, input: z.infer<typeof createCategorySchema>) {
  assertAdmin(ctx.actor);
  const slug = slugify(input.name);
  if (!slug) throw new DomainError("VALIDATION_ERROR", "Use letters or numbers in the name.", { name: ["Needs letters or numbers."] });
  try {
    return await db.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: { workspaceId: ctx.actor.workspaceId, name: input.name, slug, description: input.description || null },
      });
      await recordAudit(tx, {
        workspaceId: ctx.actor.workspaceId,
        actorId: ctx.actor.id,
        action: "category.created",
        entityType: "Category",
        entityId: category.id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        details: { name: category.name },
      });
      return category;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("CONFLICT", "A category with this name already exists.", { name: ["Already exists."] });
    }
    throw error;
  }
}

/** Categories are deactivated rather than deleted so historical work keeps its label. */
export async function updateCategory(ctx: ActorContext, categoryId: string, input: z.infer<typeof updateCategorySchema>) {
  assertAdmin(ctx.actor);
  // The slug follows the name, so a renamed category frees its old name and AI drafts match the new one.
  const slug = input.name !== undefined ? slugify(input.name) : undefined;
  if (slug === "")
    throw new DomainError("VALIDATION_ERROR", "Use letters or numbers in the name.", { name: ["Needs letters or numbers."] });
  try {
    return await renameOrUpdate(ctx, categoryId, input, slug);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("CONFLICT", "A category with this name already exists.", { name: ["Already exists."] });
    }
    throw error;
  }
}

async function renameOrUpdate(
  ctx: ActorContext,
  categoryId: string,
  input: z.infer<typeof updateCategorySchema>,
  slug: string | undefined,
) {
  return db.$transaction(async (tx) => {
    const current = await tx.category.findFirst({ where: { id: categoryId, workspaceId: ctx.actor.workspaceId } });
    if (!current) throw new DomainError("NOT_FOUND", "That category isn’t in this workspace.");
    const category = await tx.category.update({ where: { id: categoryId }, data: { ...input, ...(slug ? { slug } : {}) } });
    await recordAudit(tx, {
      workspaceId: ctx.actor.workspaceId,
      actorId: ctx.actor.id,
      action: "category.updated",
      entityType: "Category",
      entityId: categoryId,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      details: {
        ...(input.name !== undefined ? { name: { from: current.name, to: input.name } } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.description !== undefined ? { descriptionChanged: true } : {}),
      },
    });
    return category;
  });
}

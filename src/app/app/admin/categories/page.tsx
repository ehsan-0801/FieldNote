import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/ui/loading-state";
import { AdminOnly } from "@/components/admin/admin-only";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/ui/page-header";
import { canManageWorkspace } from "@/domain/access";
import { listCategories } from "@/server/admin/categories";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Categories" };

// Session-dependent content streams in behind its own boundary so client navigations stay instant.
export default function CategoriesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading categories…" />}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  const user = await requirePageUser();
  if (!canManageWorkspace(user)) return <AdminOnly />;
  const categories = await listCategories(user);
  return (
    <>
      <PageHeader
        title="Categories"
        description="Offered when filing and triaging reports, and the only categories AI drafts may choose from."
      />
      <CategoryManager
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          isActive: category.isActive,
          workOrderCount: category._count.workOrders,
        }))}
      />
    </>
  );
}

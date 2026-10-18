import type { Metadata } from "next";
import { AdminOnly } from "@/components/admin/admin-only";
import { CategoryManager } from "@/components/admin/category-manager";
import { PageHeader } from "@/components/ui/page-header";
import { canManageWorkspace } from "@/domain/access";
import { listCategories } from "@/server/admin/categories";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
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

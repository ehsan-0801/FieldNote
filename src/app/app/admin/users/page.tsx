import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/ui/loading-state";
import { AdminOnly } from "@/components/admin/admin-only";
import { UserManager } from "@/components/admin/user-manager";
import { PageHeader } from "@/components/ui/page-header";
import { canManageWorkspace } from "@/domain/access";
import { listUsers } from "@/server/admin/users";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "People" };

// Session-dependent content streams in behind its own boundary so client navigations stay instant.
export default function UsersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading people…" />}>
      <People />
    </Suspense>
  );
}

async function People() {
  const user = await requirePageUser();
  if (!canManageWorkspace(user)) return <AdminOnly />;
  const users = await listUsers(user);
  return (
    <>
      <PageHeader title="People" description="Who can sign in to this workspace and what they can do. Passwords are never shown." />
      <UserManager
        currentUserId={user.id}
        users={users.map((person) => ({
          id: person.id,
          name: person.name,
          email: person.email,
          role: person.role,
          isActive: person.isActive,
          assignedCount: person._count.assignedWorkOrders,
          reportedCount: person._count.reportedWorkOrders,
        }))}
      />
    </>
  );
}

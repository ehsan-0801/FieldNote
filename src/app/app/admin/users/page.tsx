import type { Metadata } from "next";
import { AdminOnly } from "@/components/admin/admin-only";
import { UserManager } from "@/components/admin/user-manager";
import { PageHeader } from "@/components/ui/page-header";
import { canManageWorkspace } from "@/domain/access";
import { listUsers } from "@/server/admin/users";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "People" };

export default async function UsersPage() {
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

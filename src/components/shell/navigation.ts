import { Role } from "@/generated/prisma/enums";

export type NavIcon = "overview" | "work" | "myWork" | "new" | "activity" | "users" | "categories" | "audit";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Shown in the four-slot mobile bottom bar. */
  mobile?: boolean;
}

/** Navigation mirrors server permissions for convenience only; every route re-checks on the server. */
export function navigationFor(role: Role): { main: NavItem[]; admin: NavItem[] } {
  const main: NavItem[] = [{ href: "/app", label: "Overview", icon: "overview", mobile: true }];
  if (role === Role.REPORTER) {
    main.push({ href: "/app/my-work", label: "My reports", icon: "myWork", mobile: true });
  } else {
    main.push({ href: "/app/work-orders", label: "Work orders", icon: "work", mobile: true });
  }
  if (role === Role.TECHNICIAN) main.push({ href: "/app/my-work", label: "My work", icon: "myWork" });
  main.push(
    { href: "/app/work-orders/new", label: "New report", icon: "new", mobile: true },
    { href: "/app/activity", label: "Activity", icon: "activity", mobile: true },
  );
  const admin: NavItem[] =
    role === Role.ADMIN
      ? [
          { href: "/app/admin/users", label: "People", icon: "users" },
          { href: "/app/admin/categories", label: "Categories", icon: "categories" },
          { href: "/app/admin/audit", label: "Audit log", icon: "audit" },
        ]
      : [];
  return { main, admin };
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  COORDINATOR: "Coordinator",
  TECHNICIAN: "Technician",
  REPORTER: "Reporter",
};

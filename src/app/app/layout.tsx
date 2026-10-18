import { AppShell } from "@/components/shell/app-shell";

export default function AuthenticatedLayout({ children }: LayoutProps<"/app">) {
  return <AppShell>{children}</AppShell>;
}

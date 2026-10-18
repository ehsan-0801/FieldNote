import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookIcon } from "@phosphor-icons/react/ssr";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/app");
  return null;
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-2 text-ink">
          <span className="grid size-8 place-items-center rounded-[8px] bg-ink text-chalk">
            <NotebookIcon size={18} weight="bold" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-[-0.01em]">Fieldnote Atlas</span>
        </Link>
        <div className="panel px-6 py-6">
          <h1 className="text-lg font-semibold">Sign in to your workspace</h1>
          <p className="mt-1 mb-5 text-sm text-ink-muted">Use the account your administrator created for you.</p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">Forgotten your password? Ask your workspace administrator to reset it.</p>
      </div>
    </main>
  );
}

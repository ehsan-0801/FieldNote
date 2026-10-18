"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { SignInIcon } from "@phosphor-icons/react/ssr";
import { callApi, type ApiFailure } from "@/lib/api-client";
import { InlineNotice } from "../ui/states";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await callApi("/api/auth/login", {
      method: "POST",
      body: { email, password },
      schema: z.object({ user: z.object({ name: z.string() }) }),
    });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      setPassword("");
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
        <p className="field-error">{error?.fieldErrors?.email?.[0] ?? ""}</p>
      </div>
      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="input"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <p className="field-error">{error?.fieldErrors?.password?.[0] ?? ""}</p>
      </div>
      <div aria-live="assertive">{error && !error.fieldErrors ? <InlineNotice tone="danger">{error.message}</InlineNotice> : null}</div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending || !email || !password}>
        <SignInIcon size={16} aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

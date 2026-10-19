"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { EyeIcon, EyeSlashIcon, SignInIcon } from "@phosphor-icons/react/ssr";
import { callApi, type ApiFailure } from "@/lib/api-client";
import { InlineNotice } from "../ui/states";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await callApi("/api/auth/login", {
      method: "POST",
      body: { email, password, rememberMe },
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

  // Pages stay mounted (hidden) after navigation. React runs effect cleanups when it hides
  // this page, so the form is clear (not stuck on "Signing in…", no password kept) next time.
  useEffect(
    () => () => {
      setPending(false);
      setPassword("");
      setShowPassword(false);
      setError(null);
    },
    [],
  );

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
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            className="input pr-12"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="btn btn-ghost absolute top-1/2 right-0.5 size-10 -translate-y-1/2 px-0"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls="password"
          >
            {showPassword ? <EyeSlashIcon size={18} aria-hidden /> : <EyeIcon size={18} aria-hidden />}
          </button>
        </div>
        <p className="field-error">{error?.fieldErrors?.password?.[0] ?? ""}</p>
      </div>
      <label className="flex min-h-10 items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-signal"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        <span>
          Remember me for 30 days
          <span className="block text-xs text-ink-muted">Otherwise you’ll be signed out after a day. Don’t use on shared computers.</span>
        </span>
      </label>
      <div aria-live="assertive">{error && !error.fieldErrors ? <InlineNotice tone="danger">{error.message}</InlineNotice> : null}</div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending || !email || !password}>
        <SignInIcon size={16} aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

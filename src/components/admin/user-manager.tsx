"use client";

import { useState } from "react";
import { UserPlusIcon } from "@phosphor-icons/react/ssr";
import { Role } from "@/generated/prisma/enums";
import { PASSWORD_MIN_LENGTH } from "@/domain/schemas";
import { anyData } from "@/lib/api-client";
import { fieldError, useApiAction } from "@/lib/use-api-action";
import { ROLE_LABEL } from "../shell/navigation";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";
import { InlineNotice } from "../ui/states";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  assignedCount: number;
  reportedCount: number;
}

const ROLES = Object.values(Role);
const toRole = (value: string): Role | undefined => ROLES.find((role) => role === value);

const ROLE_EFFECT: Record<Role, string> = {
  ADMIN: "Full access, including people, categories and the complete audit log.",
  COORDINATOR: "Sees all work orders, triages, assigns and confirms priority. No account administration.",
  TECHNICIAN: "Sees and updates only work assigned to them, plus their own reports.",
  REPORTER: "Files reports and follows their own reports only.",
};

/** Role editor with an explicit confirmation that explains what changes and that sessions end. */
function UserRoleEditor({ user, isSelf }: { user: ManagedUser; isSelf: boolean }) {
  const [role, setRole] = useState<Role>(user.role);
  const [confirming, setConfirming] = useState<"role" | "active" | "password" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const action = useApiAction();

  async function apply(body: { role?: Role; isActive?: boolean; password?: string }) {
    const result = await action.run(`/api/admin/users/${user.id}`, "PATCH", body, anyData);
    if (result.ok) return null;
    // Show the specific field problem (e.g. a weak password) rather than the generic summary.
    const firstFieldError = Object.values(result.error.fieldErrors ?? {})[0]?.[0];
    return firstFieldError ?? result.error.message;
  }

  if (isSelf) return <span className="text-xs text-ink-muted">This is you</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`role-${user.id}`} className="sr-only">
        Role for {user.name}
      </label>
      <select
        id={`role-${user.id}`}
        className="input h-8 w-36 text-[13px]"
        value={role}
        onChange={(event) => setRole(toRole(event.target.value) ?? user.role)}
      >
        {Object.values(Role).map((option) => (
          <option key={option} value={option}>
            {ROLE_LABEL[option]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-secondary btn-sm" disabled={role === user.role} onClick={() => setConfirming("role")}>
        Change role
      </button>
      <button
        type="button"
        className={`btn btn-sm ${user.isActive ? "btn-ghost text-oxide" : "btn-secondary"}`}
        onClick={() => setConfirming("active")}
      >
        {user.isActive ? "Deactivate" : "Reactivate"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming("password")}>
        Reset password
      </button>

      <ConfirmActionDialog
        open={confirming === "role"}
        onClose={() => (setConfirming(null), setRole(user.role))}
        title={`Make ${user.name} a ${ROLE_LABEL[role].toLowerCase()}?`}
        description={ROLE_EFFECT[role]}
        confirmLabel="Change role"
        onConfirm={() => apply({ role })}
      >
        <InlineNotice tone="warning">
          {user.name} will be signed out everywhere and get the new permissions next time they sign in.
          {user.role === Role.TECHNICIAN && user.assignedCount > 0 ? " Their open assignments will be released to triage." : ""}
        </InlineNotice>
      </ConfirmActionDialog>
      <ConfirmActionDialog
        open={confirming === "active"}
        onClose={() => setConfirming(null)}
        title={user.isActive ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
        description={
          user.isActive
            ? "They will be signed out and can’t sign in again until reactivated. Their history stays intact."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={user.isActive ? "Deactivate" : "Reactivate"}
        tone={user.isActive ? "danger" : "primary"}
        onConfirm={() => apply({ isActive: !user.isActive })}
      />
      <ConfirmActionDialog
        open={confirming === "password"}
        onClose={() => (setConfirming(null), setNewPassword(""))}
        title={`Reset ${user.name}’s password?`}
        description="Set a temporary password and share it with them privately. They are signed out everywhere."
        confirmLabel="Reset password"
        onConfirm={() =>
          newPassword.length < PASSWORD_MIN_LENGTH
            ? Promise.resolve(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
            : apply({ password: newPassword })
        }
      >
        <label htmlFor={`password-${user.id}`} className="field-label">
          New temporary password
        </label>
        <input
          id={`password-${user.id}`}
          type="password"
          autoComplete="new-password"
          className="input"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <p className="field-hint">At least {PASSWORD_MIN_LENGTH} characters. It is stored only as a hash.</p>
      </ConfirmActionDialog>
    </div>
  );
}

function CreateUserForm() {
  const [values, setValues] = useState<{ name: string; email: string; role: Role; password: string }>({
    name: "",
    email: "",
    role: Role.REPORTER,
    password: "",
  });
  const [created, setCreated] = useState<string | null>(null);
  const action = useApiAction();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setCreated(null);
    const result = await action.run("/api/admin/users", "POST", values, anyData);
    if (result.ok) {
      setCreated(values.name);
      setValues({ name: "", email: "", role: Role.REPORTER, password: "" });
    }
  }

  const input = (field: "name" | "email" | "password", label: string, type = "text", hint?: string) => (
    <div>
      <label htmlFor={`new-${field}`} className="field-label">
        {label}
      </label>
      <input
        id={`new-${field}`}
        type={type}
        className="input"
        value={values[field]}
        onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
        aria-invalid={Boolean(fieldError(action.error, field))}
        autoComplete={field === "password" ? "new-password" : "off"}
        required
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
      <p className="field-error">{fieldError(action.error, field) ?? ""}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      {input("name", "Name")}
      {input("email", "Email", "email")}
      <div>
        <label htmlFor="new-role" className="field-label">
          Role
        </label>
        <select
          id="new-role"
          className="input"
          value={values.role}
          onChange={(event) => setValues((current) => ({ ...current, role: toRole(event.target.value) ?? current.role }))}
        >
          {Object.values(Role).map((option) => (
            <option key={option} value={option}>
              {ROLE_LABEL[option]}
            </option>
          ))}
        </select>
        <p className="field-hint">{ROLE_EFFECT[values.role]}</p>
      </div>
      {input(
        "password",
        "Temporary password",
        "password",
        `At least ${PASSWORD_MIN_LENGTH} characters. Share it privately; it is stored only as a hash.`,
      )}
      <div aria-live="polite">
        {action.error && !action.error.fieldErrors ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}
        {created ? <InlineNotice tone="success">{created} can now sign in.</InlineNotice> : null}
      </div>
      <button type="submit" className="btn btn-primary" disabled={action.pending}>
        <UserPlusIcon size={16} aria-hidden />
        {action.pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

export function UserManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel relative min-w-0 overflow-x-auto" aria-label="People">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-rule">
              {["Person", "Role", "Status", "Work", "Manage"].map((heading) => (
                <th key={heading} scope="col" className="label-mono px-4 py-2.5 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-ink-muted">{user.email}</p>
                </td>
                <td className="px-4 py-3">{ROLE_LABEL[user.role]}</td>
                <td className="px-4 py-3">
                  {user.isActive ? <span className="text-signal">Active</span> : <span className="text-ink-muted italic">Deactivated</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted tabular-nums">
                  {user.assignedCount} assigned · {user.reportedCount} reported
                </td>
                <td className="px-4 py-3">
                  <UserRoleEditor key={`${user.id}:${user.role}:${user.isActive}`} user={user} isSelf={user.id === currentUserId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel self-start" aria-labelledby="create-user-heading">
        <div className="panel-head">
          <h2 id="create-user-heading" className="panel-title">
            Add a person
          </h2>
        </div>
        <div className="px-4 py-4">
          <CreateUserForm />
        </div>
      </section>
    </div>
  );
}

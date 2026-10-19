"use client";

import { useId, useState } from "react";
import { z } from "zod";
import { CheckCircleIcon, KeyIcon, MagnifyingGlassIcon, PlugsConnectedIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import {
  AI_PROVIDER_LABEL,
  AI_SERVICES,
  AI_TEST_CODES,
  aiService,
  detectServiceFromKey,
  type AiProviderKind,
  type AiServiceId,
  type AiSource,
} from "@/domain/ai-providers";
import { anyData, callApi, type ApiFailure } from "@/lib/api-client";
import { fieldError, useApiAction } from "@/lib/use-api-action";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";
import { EmptyState, InlineNotice } from "../ui/states";

export interface ManagedAiProvider {
  id: string;
  label: string;
  provider: AiProviderKind;
  service: AiServiceId;
  model: string;
  keyLast4: string;
  baseUrl: string | null;
  isActive: boolean;
  keyReadable: boolean;
  createdByName: string | null;
  updatedAt: string;
}

const testResultSchema = z.object({
  ok: z.boolean(),
  code: z.enum(AI_TEST_CODES),
  message: z.string(),
  latencyMs: z.number(),
});
type TestResult = z.infer<typeof testResultSchema>;

const modelListSchema = z.object({ models: z.array(z.string()), suggested: z.string() });

interface FormValues {
  label: string;
  service: AiServiceId;
  /** True once the admin picks a service, so a later key edit doesn't override the choice. */
  serviceChosen: boolean;
  model: string;
  baseUrl: string;
  apiKey: string;
}

const EMPTY_FORM: FormValues = { label: "", service: "openai", serviceChosen: false, model: "", baseUrl: "", apiKey: "" };

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function serviceNameFor(provider: ManagedAiProvider): string {
  return provider.service === "custom" ? AI_PROVIDER_LABEL[provider.provider] : aiService(provider.service).name;
}

function detectionHint(apiKey: string): string {
  if (apiKey.trim().length < 8) return "";
  const detected = detectServiceFromKey(apiKey);
  if (!detected) return "Couldn’t tell which service issued this key. Choose it below.";
  if (detected.ambiguous) {
    return `Looks like an ${detected.service.name} key. DeepSeek and a few others use the same “sk-” format, so change the service if it’s one of those.`;
  }
  return `Detected a ${detected.service.name} key.`;
}

/**
 * Fields shared by the add and edit forms. `existing` switches the key field to "leave
 * blank to keep" and looks up models with the saved key.
 */
function ProviderFields({
  values,
  onChange,
  error,
  existing,
}: {
  values: FormValues;
  onChange: (values: FormValues) => void;
  error: ApiFailure | null;
  existing?: { id: string; keyLast4: string };
}) {
  const id = useId();
  const [models, setModels] = useState<string[]>([]);
  const [lookup, setLookup] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null });
  const set = (patch: Partial<FormValues>) => onChange({ ...values, ...patch });
  const errorFor = (field: keyof FormValues) => fieldError(error, field);
  const service = aiService(values.service);
  const hint = values.apiKey.trim() ? detectionHint(values.apiKey) : "";

  function changeKey(apiKey: string) {
    const detected = values.serviceChosen ? null : detectServiceFromKey(apiKey);
    if (detected && detected.service.id !== values.service) setModels([]);
    set({ apiKey, ...(detected ? { service: detected.service.id as AiServiceId } : {}) });
  }

  async function findModels() {
    setLookup({ pending: true, error: null });
    const body = existing
      ? { configId: existing.id, ...(values.apiKey.trim() ? { apiKey: values.apiKey } : {}) }
      : { apiKey: values.apiKey, service: values.service, ...(values.service === "custom" ? { baseUrl: values.baseUrl } : {}) };
    const result = await callApi("/api/admin/ai-providers/models", { method: "POST", body, schema: modelListSchema });
    if (!result.ok) {
      setLookup({
        pending: false,
        error: result.error.fieldErrors ? (Object.values(result.error.fieldErrors)[0]?.[0] ?? result.error.message) : result.error.message,
      });
      return;
    }
    setModels(result.data.models);
    setLookup({ pending: false, error: null });
    if (!values.model.trim()) set({ model: result.data.suggested });
  }

  // Looking up models with a saved provider only works for the service its key belongs to.
  const canFindModels =
    (existing ? true : values.apiKey.trim().length >= 8) && (values.service !== "custom" || values.baseUrl.trim().length > 0);

  return (
    <>
      <div>
        <label htmlFor={`${id}-key`} className="field-label">
          API key
        </label>
        <input
          id={`${id}-key`}
          className="input font-mono"
          type="password"
          value={values.apiKey}
          onChange={(event) => changeKey(event.target.value)}
          maxLength={512}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          aria-describedby={`${id}-key-hint ${id}-key-detect`}
          aria-invalid={Boolean(errorFor("apiKey"))}
        />
        <p id={`${id}-key-hint`} className="field-hint">
          {existing
            ? `Leave blank to keep the current key (ending ${existing.keyLast4}).`
            : "Paste a key from any supported service. It’s stored encrypted; only the last four characters are shown."}
        </p>
        <p id={`${id}-key-detect`} className="field-hint" aria-live="polite">
          {hint}
        </p>
        <p className="field-error">{errorFor("apiKey") ?? ""}</p>
      </div>
      <div>
        <label htmlFor={`${id}-service`} className="field-label">
          Service
        </label>
        <select
          id={`${id}-service`}
          className="input"
          value={values.service}
          onChange={(event) => {
            const chosen = AI_SERVICES.find((option) => option.id === event.target.value);
            if (!chosen) return;
            setModels([]);
            set({ service: chosen.id, serviceChosen: true });
          }}
        >
          {AI_SERVICES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <p className="field-error">{errorFor("service") ?? ""}</p>
      </div>
      {values.service === "custom" ? (
        <div>
          <label htmlFor={`${id}-base`} className="field-label">
            API base URL
          </label>
          <input
            id={`${id}-base`}
            className="input font-mono"
            type="url"
            inputMode="url"
            value={values.baseUrl}
            onChange={(event) => set({ baseUrl: event.target.value })}
            maxLength={300}
            spellCheck={false}
            autoCapitalize="off"
            placeholder="https://example.com/v1"
            aria-describedby={`${id}-base-hint`}
            aria-invalid={Boolean(errorFor("baseUrl"))}
          />
          <p id={`${id}-base-hint`} className="field-hint">
            Any OpenAI-compatible API: the address before /chat/completions. For a local Ollama server: http://localhost:11434/v1
          </p>
          <p className="field-error">{errorFor("baseUrl") ?? ""}</p>
        </div>
      ) : null}
      <div>
        <label htmlFor={`${id}-model`} className="field-label">
          Model <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-model`}
            className="input min-w-0 flex-1 font-mono"
            list={`${id}-models`}
            value={values.model}
            onChange={(event) => set({ model: event.target.value })}
            maxLength={120}
            spellCheck={false}
            autoCapitalize="off"
            placeholder={existing ? undefined : "Picked automatically"}
            aria-describedby={`${id}-model-hint`}
            aria-invalid={Boolean(errorFor("model"))}
          />
          <button type="button" className="btn btn-secondary shrink-0" onClick={findModels} disabled={lookup.pending || !canFindModels}>
            <MagnifyingGlassIcon size={16} aria-hidden />
            {lookup.pending ? "Finding…" : "Find models"}
          </button>
        </div>
        <datalist id={`${id}-models`}>
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <p id={`${id}-model-hint`} className="field-hint" aria-live="polite">
          {models.length > 0
            ? `${models.length} models available for this key. Type to filter, or keep the suggestion.`
            : existing
              ? "Find models lists what this key can use."
              : `Leave blank to use ${service.preferredModels[0] ?? "the first model the provider lists"}, or the first available model.`}
        </p>
        <p className="field-error">{lookup.error ?? errorFor("model") ?? ""}</p>
      </div>
      <div>
        <label htmlFor={`${id}-label`} className="field-label">
          Label {existing ? null : <span className="font-normal text-ink-muted">(optional)</span>}
        </label>
        <input
          id={`${id}-label`}
          className="input"
          value={values.label}
          onChange={(event) => set({ label: event.target.value })}
          maxLength={60}
          placeholder={existing ? undefined : `${service.name} key`}
          aria-invalid={Boolean(errorFor("label"))}
        />
        <p className="field-error">{errorFor("label") ?? ""}</p>
      </div>
    </>
  );
}

function hasFieldError(error: ApiFailure | null): boolean {
  return Boolean(error?.fieldErrors && Object.keys(error.fieldErrors).length > 0);
}

function ProviderRow({ provider, aiDisabled }: { provider: ManagedAiProvider; aiDisabled: boolean }) {
  const initial: FormValues = {
    label: provider.label,
    service: provider.service,
    serviceChosen: true,
    model: provider.model,
    baseUrl: provider.baseUrl ?? "",
    apiKey: "",
  };
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const save = useApiAction();
  const activate = useApiAction();
  const remove = useApiAction();
  const test = useApiAction();
  const headingId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = {
      label: values.label,
      service: values.service,
      model: values.model,
      ...(values.service === "custom" ? { baseUrl: values.baseUrl } : {}),
      ...(values.apiKey.trim() ? { apiKey: values.apiKey } : {}),
    };
    const result = await save.run(`/api/admin/ai-providers/${provider.id}`, "PATCH", body, anyData);
    if (result.ok) {
      setEditing(false);
      setTestResult(null);
    }
  }

  async function runTest() {
    setTestResult(null);
    const result = await test.run(`/api/admin/ai-providers/${provider.id}/test`, "POST", {}, testResultSchema);
    if (result.ok) setTestResult(result.data);
  }

  const rowError = activate.error ?? test.error;

  return (
    <li className="px-4 py-4" aria-labelledby={headingId}>
      {editing ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
          <h3 id={headingId} className="text-sm font-semibold sm:col-span-2">
            Edit “{provider.label}”
          </h3>
          <ProviderFields
            values={values}
            onChange={setValues}
            error={save.error}
            existing={{ id: provider.id, keyLast4: provider.keyLast4 }}
          />
          <div className="sm:col-span-2" aria-live="polite">
            {save.error && !hasFieldError(save.error) ? <InlineNotice tone="danger">{save.error.message}</InlineNotice> : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={save.pending}>
              {save.pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => (setEditing(false), setValues(initial), save.clearError())}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="font-medium break-words">
                {provider.label}
              </h3>
              {provider.isActive ? (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-[6px] border border-signal bg-signal-soft px-2 text-xs font-medium whitespace-nowrap text-signal">
                  <CheckCircleIcon size={14} aria-hidden />
                  Active
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs break-words text-ink-muted">
              {serviceNameFor(provider)} · <span className="font-mono">{provider.model}</span>
              {provider.service === "custom" && provider.baseUrl ? (
                <>
                  {" "}
                  · <span className="font-mono">{hostOf(provider.baseUrl)}</span>
                </>
              ) : null}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <KeyIcon size={14} aria-hidden />
              <span>
                Key ending <span className="font-mono">{provider.keyLast4}</span>
                {provider.createdByName ? ` · added by ${provider.createdByName}` : ""}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={runTest} disabled={test.pending || aiDisabled}>
              {test.pending ? "Testing…" : "Test connection"}
            </button>
            {provider.isActive ? null : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => activate.run(`/api/admin/ai-providers/${provider.id}/activate`, "POST", {}, anyData)}
                disabled={activate.pending || !provider.keyReadable}
              >
                {activate.pending ? "Switching…" : "Use this provider"}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          </div>
        </div>
      )}
      <div aria-live="polite">
        {!editing && !provider.keyReadable ? (
          <div className="mt-3">
            <InlineNotice tone="warning">
              The saved key can’t be decrypted, probably because the encryption secret changed. Edit this provider and enter the key again.
            </InlineNotice>
          </div>
        ) : null}
        {testResult ? (
          <div className="mt-3">
            <InlineNotice tone={testResult.ok ? "success" : "danger"}>
              {testResult.message}
              {testResult.ok ? <span className="font-mono"> ({testResult.latencyMs} ms)</span> : null}
            </InlineNotice>
          </div>
        ) : null}
        {rowError ? (
          <div className="mt-3">
            <InlineNotice tone="danger">{rowError.message}</InlineNotice>
          </div>
        ) : null}
      </div>
      <ConfirmActionDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={`Delete “${provider.label}”?`}
        description={
          provider.isActive
            ? "Its encrypted key is removed. This provider is active, so drafting and the assistant switch to the environment default."
            : "Its encrypted key is removed. Past drafts keep the provider and model they were made with."
        }
        confirmLabel="Delete provider"
        tone="danger"
        onConfirm={async () => {
          const result = await remove.run(`/api/admin/ai-providers/${provider.id}`, "DELETE", undefined, anyData);
          return result.ok ? null : result.error.message;
        }}
      />
    </li>
  );
}

function SourceSummary({ source, hasActive }: { source: AiSource; hasActive: boolean }) {
  const action = useApiAction();
  const [confirming, setConfirming] = useState(false);

  let notice: React.ReactNode;
  switch (source.kind) {
    case "disabled":
      notice = (
        <InlineNotice tone="warning" title="AI is off for this deployment">
          AI_PROVIDER is set to none, so drafting uses the rule-based fallback and the assistant is unavailable, whatever is selected here.
        </InlineNotice>
      );
      break;
    case "workspace":
      notice = source.usable ? (
        <InlineNotice tone="success" title={`Using “${source.label}”`}>
          {AI_PROVIDER_LABEL[source.provider]} · <span className="font-mono">{source.model}</span>, for report drafting and the assistant.
        </InlineNotice>
      ) : (
        <InlineNotice tone="danger" title={`“${source.label}” is active but can’t be used`}>
          Its key can’t be decrypted, so drafting uses the rule-based fallback and the assistant is unavailable. Enter the key again, or
          switch to the environment default.
        </InlineNotice>
      );
      break;
    case "environment":
      notice = source.hasKey ? (
        <InlineNotice title="Using the environment default">
          {AI_PROVIDER_LABEL[source.provider]} · <span className="font-mono">{source.model}</span>, from the deployment’s environment
          variables. Choose a provider below to override it for this workspace.
        </InlineNotice>
      ) : (
        <InlineNotice tone="warning" title="No AI provider is in effect">
          The environment selects {AI_PROVIDER_LABEL[source.provider]} but has no key, so drafting uses the rule-based fallback and the
          assistant is unavailable. Add a provider and choose “Use this provider”.
        </InlineNotice>
      );
      break;
  }

  return (
    <section className="panel" aria-labelledby="ai-source-heading">
      <div className="panel-head">
        <h2 id="ai-source-heading" className="panel-title">
          In effect now
        </h2>
        {hasActive ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
            Use environment default
          </button>
        ) : null}
      </div>
      <div className="px-4 py-4" aria-live="polite">
        {notice}
      </div>
      <ConfirmActionDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Use the environment default?"
        description="The workspace provider stays saved but inactive. Drafting and the assistant use the deployment’s environment settings instead."
        confirmLabel="Use environment default"
        onConfirm={async () => {
          const result = await action.run("/api/admin/ai-providers/use-environment", "POST", {}, anyData);
          return result.ok ? null : result.error.message;
        }}
      />
    </section>
  );
}

export function AiProviderManager({ providers, source }: { providers: ManagedAiProvider[]; source: AiSource }) {
  const [values, setValues] = useState(EMPTY_FORM);
  const [activate, setActivate] = useState(true);
  // Remounts the add form's fields after a save, clearing their model list.
  const [formKey, setFormKey] = useState(0);
  const action = useApiAction();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const body = {
      apiKey: values.apiKey,
      service: values.service,
      label: values.label,
      model: values.model,
      activate,
      ...(values.service === "custom" ? { baseUrl: values.baseUrl } : {}),
    };
    const result = await action.run("/api/admin/ai-providers", "POST", body, anyData);
    if (result.ok) {
      setValues(EMPTY_FORM);
      setFormKey((key) => key + 1);
    }
  }

  const canSubmit = values.apiKey.trim().length >= 8 && (values.service !== "custom" || values.baseUrl.trim());
  const aiDisabled = source.kind === "disabled";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-6 self-start">
        <SourceSummary source={source} hasActive={providers.some((provider) => provider.isActive)} />
        <section className="panel" aria-label="Saved AI providers">
          {providers.length === 0 ? (
            <EmptyState icon={PlugsConnectedIcon} title="No AI providers saved for this workspace.">
              Until you add one, drafting and the assistant use the environment settings.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-rule">
              {providers.map((provider) => (
                <ProviderRow
                  key={`${provider.id}:${provider.updatedAt}:${provider.isActive}`}
                  provider={provider}
                  aiDisabled={aiDisabled}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="panel self-start" aria-labelledby="new-ai-provider-heading">
        <div className="panel-head">
          <h2 id="new-ai-provider-heading" className="panel-title">
            Add a provider
          </h2>
        </div>
        <form onSubmit={create} className="grid gap-3 px-4 py-4" noValidate>
          <ProviderFields key={formKey} values={values} onChange={setValues} error={action.error} />
          <label className="flex min-h-10 items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-signal"
              checked={activate}
              onChange={(event) => setActivate(event.target.checked)}
            />
            <span>Use it for drafting and the assistant once it connects</span>
          </label>
          <div aria-live="polite">
            {action.error && !hasFieldError(action.error) ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}
          </div>
          <button type="submit" className="btn btn-primary" disabled={action.pending || !canSubmit}>
            <PlusIcon size={16} aria-hidden />
            {action.pending ? "Checking the key…" : "Connect provider"}
          </button>
          <p className="field-hint">
            {aiDisabled
              ? "AI is off for this deployment, so the key is saved without a check and nothing is sent."
              : "The key is checked with one short test prompt before it’s saved."}
          </p>
        </form>
      </section>
    </div>
  );
}

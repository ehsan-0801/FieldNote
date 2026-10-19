import { z } from "zod";

export interface ApiFailure {
  code: string;
  message: string;
  requestId?: string;
  fieldErrors?: Record<string, string[]>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

const failureEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

const NETWORK_FAILURE: ApiFailure = {
  code: "NETWORK",
  message: "Couldn’t reach Fieldnote Atlas. Check your connection and try again.",
};

/** Calls one of our JSON endpoints and validates the envelope and payload shape. */
export async function callApi<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; schema: z.ZodType<T>; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, error: { code: "TIMEOUT", message: "This took too long to answer. Try again." } };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: { code: "ABORTED", message: "Cancelled." } };
    }
    return { ok: false, error: NETWORK_FAILURE };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: NETWORK_FAILURE };
  }

  if (!response.ok) {
    const failure = failureEnvelope.safeParse(json);
    return { ok: false, error: failure.success ? failure.data.error : NETWORK_FAILURE };
  }
  const success = z.object({ data: options.schema }).safeParse(json);
  if (!success.success) return { ok: false, error: { code: "BAD_RESPONSE", message: "The server sent an unexpected response." } };
  return { ok: true, data: success.data.data };
}

export const anyData = z.unknown();

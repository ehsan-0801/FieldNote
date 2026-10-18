"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { callApi, type ApiFailure, type ApiResult } from "./api-client";

/**
 * Pending/error state for one mutation, refreshing server data on success so the
 * page always reflects what the server actually stored.
 */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  const run = useCallback(
    async <T>(path: string, method: "POST" | "PATCH", body: unknown, schema: z.ZodType<T>): Promise<ApiResult<T>> => {
      setPending(true);
      setError(null);
      const result = await callApi(path, { method, body, schema });
      setPending(false);
      if (result.ok) router.refresh();
      else setError(result.error);
      return result;
    },
    [router],
  );

  return { pending, error, run, clearError: () => setError(null) };
}

export function fieldError(error: ApiFailure | null, field: string): string | undefined {
  return error?.fieldErrors?.[field]?.[0];
}

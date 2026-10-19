import "server-only";
import { connection, NextResponse } from "next/server";
import { newRequestId } from "./request-context";

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Handler for the methods a route doesn't implement. Next.js would otherwise answer
 * them with a bare 405; this keeps the JSON error envelope every endpoint uses and
 * names the supported methods in `Allow`. HEAD and OPTIONS are listed because
 * Next.js implements them automatically (HEAD only alongside GET).
 */
export function methodNotAllowed(...allowed: RouteMethod[]) {
  const methods: string[] = [...allowed, "OPTIONS"];
  if (allowed.includes("GET")) methods.push("HEAD");
  const allow = methods.sort().join(", ");

  return async (request: Request) => {
    // Opt out of prerendering: a GET stub must not bake one request ID into the build.
    if (request.method === "GET" || request.method === "HEAD") await connection();
    const requestId = newRequestId();
    return NextResponse.json(
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: `This endpoint doesn’t accept ${request.method} requests. Use ${allowed.join(" or ")}.`,
          requestId,
        },
      },
      { status: 405, headers: { Allow: allow, "x-request-id": requestId } },
    );
  };
}

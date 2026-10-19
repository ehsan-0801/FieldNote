import { NextResponse } from "next/server";
import { newRequestId } from "@/server/request-context";

/** Unknown API paths answer in the same JSON error envelope as every other endpoint. */
function notFound() {
  const requestId = newRequestId();
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "There is no API endpoint at this address.", requestId } },
    { status: 404, headers: { "x-request-id": requestId } },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;

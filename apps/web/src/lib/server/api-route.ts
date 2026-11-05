import "server-only";
import { NextResponse } from "next/server";
import { SessionUnavailableError, serverErrorSummary } from "./session";

/**
 * Wraps a JSON API handler so a failure always reaches the browser as readable
 * JSON. Without this, an uncaught error becomes a 500 with an empty body, which
 * browsers report as "Unexpected end of JSON input" and which hides the cause.
 * The real cause goes to the server log; the client only gets a safe message.
 */
export function jsonRoute<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      // Next.js signals redirects and similar control flow by throwing these.
      if (typeof (error as { digest?: unknown })?.digest === "string") throw error;
      const headers = { "cache-control": "no-store" };
      // getSession has already logged the database error behind this one.
      if (error instanceof SessionUnavailableError)
        return NextResponse.json({ error: error.message }, { status: 503, headers });
      console.error(`${route} failed`, serverErrorSummary(error));
      return NextResponse.json(
        { error: "Something went wrong on our side. Please try again." },
        { status: 500, headers },
      );
    }
  };
}

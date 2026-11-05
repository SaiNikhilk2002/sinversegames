import { z } from "zod";
import { emailSchema } from "@platform/shared";
import { accountJson, smallJson } from "@/lib/server/account";
import { jsonRoute } from "@/lib/server/api-route";
import { emailContext, startEmailAttempt, UNAVAILABLE } from "@/lib/server/email-auth";
import { isSameOrigin } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const body = z
  .object({ email: emailSchema, method: z.enum(["otp", "link"]) })
  .strict();

async function handlePOST(request: Request) {
  if (!(await isSameOrigin())) return accountJson({ error: "Forbidden" }, 403);
  const context = emailContext();
  if (!context) return accountJson({ error: UNAVAILABLE }, 503);
  if (new URL(request.url).origin !== context.config.origin)
    return accountJson(
      { error: `Open ${context.config.origin}/account to sign in.` },
      400,
    );
  const parsed = body.safeParse(await smallJson(request));
  if (!parsed.success)
    return accountJson({ error: "Enter a valid email address." }, 400);
  return startEmailAttempt(context, parsed.data.email, parsed.data.method);
}

export const POST = jsonRoute("email start POST", handlePOST);

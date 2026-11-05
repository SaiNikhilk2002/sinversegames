import { z } from "zod";
import { emailLinkTokenSchema, emailSchema, otpSchema } from "@platform/shared";
import { accountJson, smallJson } from "@/lib/server/account";
import { jsonRoute } from "@/lib/server/api-route";
import {
  emailContext,
  INVALID_CODE,
  UNAVAILABLE,
  verifyEmailCode,
  verifyEmailLink,
} from "@/lib/server/email-auth";
import { isSameOrigin } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const code = z.object({ kind: z.literal("code"), email: emailSchema, code: otpSchema }).strict();
const link = z
  .object({
    kind: z.literal("link"),
    token: emailLinkTokenSchema,
    confirm: z.boolean().optional(),
  })
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
  const body = await smallJson(request);
  const asLink = link.safeParse(body);
  if (asLink.success)
    return verifyEmailLink(context, asLink.data.token, !!asLink.data.confirm);
  const asCode = code.safeParse(body);
  if (asCode.success)
    return verifyEmailCode(context, asCode.data.email, asCode.data.code);
  if ((body as { kind?: unknown } | null)?.kind === "link")
    return accountJson(
      { error: "This sign-in link isn't valid. Request a new one.", code: "invalid" },
      400,
    );
  return accountJson({ error: INVALID_CODE }, 400);
}

export const POST = jsonRoute("email verify POST", handlePOST);

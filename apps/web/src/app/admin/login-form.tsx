"use client";

import { useActionState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { login, type LoginState } from "./actions";

export function AdminLogin() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <Card className="p-6">
        <h1 className="font-display text-2xl font-bold">Moderator sign in</h1>
        <form action={action} className="mt-5 space-y-3">
          <label htmlFor="token" className="block text-sm font-semibold">
            Admin token
          </label>
          <Input id="token" name="token" type="password" autoComplete="current-password" required />
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" loading={pending} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}

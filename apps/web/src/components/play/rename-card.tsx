"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Button } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { NameForm } from "./name-gate";

/** Shown on server-rendered pages when the visitor has no identity yet; reloads the page data after saving. */
export function CreateProfile() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-6 sm:p-8">
        <h1 className="mb-1 font-display text-2xl font-bold">Create your player profile</h1>
        <p className="mb-6 text-ink-muted">Pick a name to start tracking your games, wins and achievements.</p>
        <NameForm submitLabel="Create profile" onSaved={() => router.refresh()} />
      </Card>
    </div>
  );
}

export function RenameCard({ name, color }: { name: string; color: string }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-bold">Display name</h2>
      {editing ? (
        <div className="mt-4">
          <NameForm
            initialName={name}
            initialColor={color}
            submitLabel="Save"
            onSaved={() => {
              setEditing(false);
              toast("Profile updated", "success");
              router.refresh();
            }}
          />
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-ink-muted">Change how other players see you.</p>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </Card>
  );
}

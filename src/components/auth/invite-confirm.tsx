"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinInvite } from "@/app/app/settings/team/actions";

/** Bestätigungs-Abfrage für einen bereits eingeloggten Nutzer: „Einladung annehmen?" */
export function InviteConfirm({
  token,
  orgName,
  role,
  currentEmail,
}: {
  token: string;
  orgName: string;
  role: string;
  currentEmail: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleLabel = role === "owner" ? "Inhaber" : "Bearbeiter";

  async function join() {
    setPending(true);
    setError(null);
    const r = await joinInvite(token);
    if (r.ok) window.location.href = "/app";
    else {
      setError(r.message ?? "Beitritt fehlgeschlagen.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
          <UserPlus className="size-5" />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Einladung annehmen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Du wurdest als <b>{roleLabel}</b> zu <b>{orgName || "einer Organisation"}</b> eingeladen.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Angemeldet als {currentEmail}.</p>

        {error && <p className="mt-4 rounded-lg bg-no-soft px-3 py-2 text-sm text-no">{error}</p>}

        <div className="mt-6 space-y-2">
          <Button className="w-full" onClick={join} disabled={pending}>
            {pending ? "Trete bei …" : `${orgName || "Organisation"} beitreten`}
          </Button>
          <a
            href="/app"
            className="block text-center text-sm text-muted-foreground hover:text-ink"
          >
            Später
          </a>
        </div>
      </div>
    </div>
  );
}

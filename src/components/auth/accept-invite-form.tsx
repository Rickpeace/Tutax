"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite } from "@/app/app/settings/team/actions";

export function AcceptInviteForm({
  token,
  email,
  orgName,
  hasAccount,
}: {
  token: string;
  email: string;
  orgName: string;
  hasAccount: boolean;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Bitte ein Passwort eingeben.");
      return;
    }
    if (!hasAccount && password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setPending(true);
    setError(null);
    const r = await acceptInvite(token, password);
    if (r.ok) {
      window.location.href = "/app"; // harte Navigation -> Server sieht die neue Session
    } else {
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
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Team beitreten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasAccount ? (
            <>Du hast schon ein Konto. Melde dich an, um {orgName ? <><b>{orgName}</b> </> : null}beizutreten.</>
          ) : (
            <>Du wurdest {orgName ? <>zu <b>{orgName}</b> </> : null}eingeladen. Lege ein Passwort fest, um beizutreten.</>
          )}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">E-Mail</Label>
            <Input id="invite-email" type="email" value={email} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-password">{hasAccount ? "Dein Passwort" : "Passwort festlegen"}</Label>
            <Input
              id="invite-password"
              type="password"
              autoComplete={hasAccount ? "current-password" : "new-password"}
              autoFocus
              required
              minLength={hasAccount ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={hasAccount ? "Passwort deines Kontos" : "mindestens 8 Zeichen"}
            />
          </div>
          {error && <p className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Trete bei …" : hasAccount ? "Anmelden & beitreten" : "Passwort setzen & beitreten"}
          </Button>
        </form>
      </div>
    </div>
  );
}

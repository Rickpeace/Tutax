"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { acceptInviteForm } from "@/app/app/settings/team/actions";

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
  // Server-Action-Formular (wie Login): klappt auch vor dem Fertigladen der Seite; Prüfungen
  // (Passwortlänge, Einladung gültig, Team voll) macht acceptInvite serverseitig.
  const [state, action, pending] = useActionState(acceptInviteForm, {});
  const error = state.message ?? null;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
          <UserPlus className="size-5" />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Team beitreten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasAccount ? (
            <>Sie haben schon ein Konto. Melden Sie sich an, um {orgName ? <><b>{orgName}</b> </> : null}beizutreten.</>
          ) : (
            <>Sie wurden {orgName ? <>zu <b>{orgName}</b> </> : null}eingeladen. Legen Sie ein Passwort fest, um beizutreten.</>
          )}
        </p>

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">E-Mail</Label>
            <Input id="invite-email" type="email" value={email} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-password">{hasAccount ? "Ihr Passwort" : "Passwort festlegen"}</Label>
            <PasswordInput
              id="invite-password"
              name="password"
              autoComplete={hasAccount ? "current-password" : "new-password"}
              autoFocus
              required
              minLength={hasAccount ? undefined : 8}
              placeholder={hasAccount ? "Passwort Ihres Kontos" : "mindestens 8 Zeichen"}
            />
          </div>
          {error && <p className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Beitritt läuft …" : hasAccount ? "Anmelden & beitreten" : "Passwort setzen & beitreten"}
          </Button>
        </form>
      </div>
    </div>
  );
}

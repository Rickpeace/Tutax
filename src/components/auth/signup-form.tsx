"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp, type AuthState } from "@/app/(auth)/actions";

const EMPTY: AuthState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, EMPTY);

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Konto erstellen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Starten Sie kostenlos mit Ihren Hilfe-Anleitungen.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="account_name">Name der Organisation</Label>
          <Input
            id="account_name"
            name="account_name"
            type="text"
            placeholder="Muster GmbH"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@firma.de"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
        </div>

        {state.error && (
          <p className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="rounded-lg bg-yes-soft px-3 py-2 text-sm text-yes">
            {state.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Konto wird erstellt …" : "Kostenlos registrieren"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Bereits ein Konto?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Anmelden
        </Link>
      </p>
    </div>
  );
}

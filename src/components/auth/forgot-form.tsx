"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type AuthState } from "@/app/(auth)/actions";

const EMPTY: AuthState = {};

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, EMPTY);

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Passwort vergessen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Geben Sie Ihre E-Mail ein – wir senden Ihnen einen Link zum Zurücksetzen.
      </p>

      <form action={action} className="mt-6 space-y-4">
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
        {state.error && (
          <p className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">{state.error}</p>
        )}
        {state.message && (
          <p className="rounded-lg bg-yes-soft px-3 py-2 text-sm text-yes">{state.message}</p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Wird gesendet …" : "Link senden"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Zurück zur Anmeldung
        </Link>
      </p>
    </div>
  );
}

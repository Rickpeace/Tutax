"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type AuthState } from "@/app/(auth)/actions";

const EMPTY: AuthState = {};

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Neues Passwort setzen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Wählen Sie ein neues Passwort (mindestens 8 Zeichen).
      </p>

      <form action={action} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">Neues Passwort</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
        {state.error && (
          <p className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Speichern …" : "Passwort speichern"}
        </Button>
      </form>
    </div>
  );
}

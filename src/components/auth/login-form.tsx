"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithPassword,
  signInWithMagicLink,
  type AuthState,
} from "@/app/(auth)/actions";

const EMPTY: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = useActionState(
    signInWithPassword,
    EMPTY,
  );
  const [mlState, mlAction, mlPending] = useActionState(
    signInWithMagicLink,
    EMPTY,
  );

  const state = mode === "password" ? pwState : mlState;
  const pending = mode === "password" ? pwPending : mlPending;

  return (
    <div>
      <h1 className="text-xl font-bold text-ink">Anmelden</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Willkommen zurück bei Steply.
      </p>

      {mode === "password" ? (
        <form action={pwAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
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
              autoComplete="current-password"
              required
            />
          </div>
          <FormFeedback state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Anmelden …" : "Anmelden"}
          </Button>
        </form>
      ) : (
        <form action={mlAction} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ml-email">E-Mail</Label>
            <Input
              id="ml-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@firma.de"
            />
          </div>
          <FormFeedback state={state} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Link wird gesendet …" : "Magic Link senden"}
          </Button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "password" ? "magic" : "password")}
          className="text-sm font-medium text-primary hover:underline"
        >
          {mode === "password"
            ? "Stattdessen mit Magic Link anmelden"
            : "Stattdessen mit Passwort anmelden"}
        </button>
        <Link href="/forgot" className="text-sm text-muted-foreground hover:text-ink">
          Passwort vergessen?
        </Link>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Noch kein Konto?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Registrieren
        </Link>
      </p>
    </div>
  );
}

function FormFeedback({ state }: { state: AuthState }) {
  if (state.error)
    return (
      <p className="rounded-lg bg-no-soft px-3 py-2 text-sm text-no">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="rounded-lg bg-yes-soft px-3 py-2 text-sm text-yes">
        {state.message}
      </p>
    );
  return null;
}

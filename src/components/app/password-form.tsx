"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { FieldLabel, settingsInputClass } from "@/components/app/settings-ui";
import { changePassword } from "@/app/app/settings/konto/actions";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    if (pw !== pw2) {
      toast.error("Passwörter stimmen nicht überein.");
      return;
    }
    startTransition(async () => {
      const res = await changePassword(current, pw);
      if (res.ok) {
        toast.success("Passwort geändert");
        setCurrent("");
        setPw("");
        setPw2("");
      } else {
        toast.error(res.error ?? "Fehler");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="pw-current">Aktuelles Passwort</FieldLabel>
        <PasswordInput
          id="pw-current"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          className={settingsInputClass}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="pw">Neues Passwort</FieldLabel>
        <PasswordInput
          id="pw"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className={settingsInputClass}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="pw2">Wiederholen</FieldLabel>
        <PasswordInput
          id="pw2"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          className={settingsInputClass}
        />
      </div>
      <Button onClick={save} disabled={pending || !pw || !current} className="w-fit">
        {pending ? "Speichert …" : "Passwort ändern"}
      </Button>
    </div>
  );
}

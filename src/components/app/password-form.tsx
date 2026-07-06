"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/app/app/settings/konto/actions";

export function PasswordForm() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    if (pw !== pw2) {
      toast.error("Passwörter stimmen nicht überein.");
      return;
    }
    startTransition(async () => {
      const res = await changePassword(pw);
      if (res.ok) {
        toast.success("Passwort geändert");
        setPw("");
        setPw2("");
      } else {
        toast.error(res.error ?? "Fehler");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="pw">Neues Passwort</Label>
        <PasswordInput
          id="pw"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw2">Wiederholen</Label>
        <PasswordInput
          id="pw2"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button onClick={save} disabled={pending || !pw}>
        {pending ? "Speichert …" : "Passwort ändern"}
      </Button>
    </div>
  );
}

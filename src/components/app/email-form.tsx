"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FieldLabel, settingsInputClass } from "@/components/app/settings-ui";
import { changeEmail } from "@/app/app/settings/konto/actions";

export function EmailForm({ current }: { current: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await changeEmail(email, password);
      if (res.ok) {
        toast.success("Fast geschafft!", {
          description:
            "Wir haben Bestätigungs-Links an die neue (und ggf. alte) Adresse geschickt – bitte den Link in der E-Mail anklicken.",
        });
        setEmail("");
        setPassword("");
      } else {
        toast.error(res.error ?? "Fehler");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="new-email">Neue E-Mail-Adresse</FieldLabel>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={current}
          autoComplete="email"
          className={settingsInputClass}
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="email-current-password">Aktuelles Passwort</FieldLabel>
        <PasswordInput
          id="email-current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={settingsInputClass}
        />
      </div>
      <Button onClick={save} disabled={pending || !email.trim() || !password} className="w-fit">
        {pending ? "Sendet …" : "E-Mail ändern"}
      </Button>
    </div>
  );
}

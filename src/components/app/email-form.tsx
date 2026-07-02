"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeEmail } from "@/app/app/settings/konto/actions";

export function EmailForm({ current }: { current: string }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await changeEmail(email);
      if (res.ok) {
        toast.success("Fast geschafft!", {
          description:
            "Wir haben Bestätigungs-Links verschickt – bitte prüfen Sie das Postfach der neuen (und ggf. alten) Adresse.",
        });
        setEmail("");
      } else {
        toast.error(res.error ?? "Fehler");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-email">Neue E-Mail-Adresse</Label>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={current}
          autoComplete="email"
        />
      </div>
      <Button onClick={save} disabled={pending || !email.trim()}>
        {pending ? "Sendet …" : "E-Mail ändern"}
      </Button>
    </div>
  );
}

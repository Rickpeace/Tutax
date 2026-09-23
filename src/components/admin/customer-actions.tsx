"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setAccountPlan, sendMemberPasswordLink, deleteCustomer } from "@/app/admin/actions";
import { errorText, unwrap } from "@/lib/action-error";
import type { PlanKey } from "@/lib/admin-customers";

const PLAN_LABEL: Record<PlanKey, string> = { free: "Gratis", pro: "Pro", business: "Business" };

/** Was sich beim Wechsel für den Kunden ändert (kurz, für die Bestätigung). */
function planEffect(from: PlanKey, to: PlanKey): string {
  const rank = { free: 0, pro: 1, business: 2 } as const;
  if (rank[to] > rank[from]) {
    return to === "business"
      ? "Freigeschaltet: alles aus Pro plus KI-Design, Mehrsprachigkeit, Vorlesen, interne Schulungen, unbegrenztes Team. Wirkt sofort."
      : "Freigeschaltet: KI-Assistent, Wissensdatenbank, KI im Editor, Video, eigenes Logo/CI, Team bis 5. Der Chatbot-Index wird im Hintergrund aufgebaut.";
  }
  return to === "free"
    ? "Gesperrt: alle KI-Funktionen, Chat, Wissensdatenbank, Video, eigenes Logo/CI; die Hilfe-Seite zeigt wieder „Erstellt mit Steply“. Gespeicherte Daten bleiben erhalten und gelten nach einem erneuten Upgrade wieder."
    : "Gesperrt: KI-Design, Mehrsprachigkeit, Vorlesen, interne Schulungen (Team über 5 bleibt, neue Einladungen nur bis 5). Gespeicherte Daten bleiben erhalten.";
}

export function PlanSwitch({ accountId, plan }: { accountId: string; plan: PlanKey }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  async function choose(next: PlanKey) {
    if (next === plan) return;
    const ok = await confirm({
      title: `Tarif auf „${PLAN_LABEL[next]}“ ändern?`,
      description: planEffect(plan, next),
      confirmLabel: `Auf ${PLAN_LABEL[next]} umstellen`,
      destructive: next === "free",
    });
    if (!ok) return;
    start(async () => {
      try {
        await setAccountPlan(accountId, next);
        toast.success(`Tarif ist jetzt ${PLAN_LABEL[next]}`);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e, "Tarif konnte nicht geändert werden"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="plan-switch">
      {(["free", "pro", "business"] as const).map((p) => (
        <Button
          key={p}
          type="button"
          size="sm"
          variant={plan === p ? "default" : "outline"}
          disabled={pending || plan === p}
          onClick={() => void choose(p)}
          aria-pressed={plan === p}
        >
          {PLAN_LABEL[p]}
        </Button>
      ))}
      {confirmDialog}
    </div>
  );
}

export function ResetLinkButton({ userId, email }: { userId: string; email: string }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  async function send() {
    const ok = await confirm({
      title: "Passwort-Link schicken?",
      description: `${email} bekommt eine E-Mail mit einem Link, über den ein neues Passwort gesetzt werden kann. Das bisherige Passwort gilt weiter, bis es geändert wird.`,
      confirmLabel: "Link schicken",
    });
    if (!ok) return;
    start(async () => {
      try {
        const { email: to } = unwrap(await sendMemberPasswordLink(userId));
        toast.success(`Link an ${to} verschickt`);
      } catch (e) {
        toast.error(errorText(e, "Link konnte nicht verschickt werden"));
      }
    });
  }
  return (
    <>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void send()} title="Passwort-Link schicken">
        <KeyRound className="size-4" />
        <span className="sr-only md:not-sr-only">Passwort-Link</span>
      </Button>
      {confirmDialog}
    </>
  );
}

export function DeleteCustomer({ accountId, name, blocked }: { accountId: string; name: string; blocked?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        const res = unwrap(await deleteCustomer(accountId, typed));
        toast.success(`„${name}“ gelöscht – ${res.files} Dateien, ${res.users} Personen ohne weitere Organisation entfernt`);
        setOpen(false);
        router.push("/admin/kunden");
        router.refresh();
      } catch (e) {
        toast.error(errorText(e, "Löschen fehlgeschlagen"));
      }
    });
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" disabled={!!blocked} title={blocked} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Kunden löschen
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>„{name}“ endgültig löschen?</DialogTitle>
            <DialogDescription>
              Gelöscht werden alle Anleitungen, Bilder, Videos, Wissensartikel, Automationen, Einladungen und die
              Hilfe-Seite. Personen, die in keiner anderen Organisation sind, verlieren ihr Konto. Das lässt sich
              nicht rückgängig machen.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm font-bold text-ink">
            Zur Bestätigung den Namen eingeben: <span className="font-black">{name}</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Name der Organisation" autoComplete="off" />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="button" variant="destructive" disabled={pending || typed.trim() !== name.trim()} onClick={run}>
              {pending ? "Löscht …" : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

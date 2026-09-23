"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { leaveTeam } from "@/app/app/settings/team/actions";

/**
 * „Organisation verlassen" (Profil). Jede Rolle darf gehen — außer dem letzten Inhaber
 * (Server prüft das und erklärt es). Danach frisch in die nächste Organisation; gibt es
 * keine mehr, meldet die App ab und erklärt es auf der Anmeldeseite.
 */
export function LeaveTeam({
  accountId,
  orgName,
  blockedReason,
}: {
  /** Organisation, die die Seite zeigt (Schutz gegen Org-Wechsel in einem anderen Tab). */
  accountId: string;
  orgName: string;
  blockedReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  async function leave() {
    const ok = await confirm({
      title: `„${orgName}“ verlassen?`,
      description: "Sie verlieren sofort den Zugriff auf diese Organisation. Wieder hinein kommen Sie nur mit einer neuen Einladung.",
      confirmLabel: "Organisation verlassen",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await leaveTeam(accountId);
      if (!res.ok) {
        toast.error(res.error);
        setBusy(false);
        return;
      }
      window.location.assign(res.hasOtherOrg ? "/app" : "/logout?next=" + encodeURIComponent("/login?error=verlassen"));
    } catch {
      toast.error("Verlassen hat nicht geklappt – bitte Seite neu laden und erneut versuchen.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={busy || !!blockedReason} onClick={leave}>
          <LogOut className="size-4" /> {orgName} verlassen
        </Button>
      </div>
      {confirmDialog}
    </div>
  );
}

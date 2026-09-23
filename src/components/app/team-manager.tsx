"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, Copy, Mail, X, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  inviteMember,
  revokeInvitation,
  removeMember,
  changeMemberRole,
  resendInvitation,
  type InviteResult,
} from "@/app/app/settings/team/actions";
import { ROLES, ROLE_HINT, ROLE_LABEL, asRole } from "@/lib/roles";
import { FieldLabel, SettingsCard, settingsInputClass } from "@/components/app/settings-ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { unwrap, errorText } from "@/lib/action-error";

type Member = { userId: string; role: string; email: string; name?: string | null; isYou: boolean };
type Invitation = { id: string; email: string; role: string; token: string; expired: boolean; expiresAt: string };

const roleLabel = (role: string) => ROLE_LABEL[asRole(role)];

function RolePill({ role }: { role: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${
        role === "owner" ? "bg-accent text-coral-text" : "bg-line-2 text-ink-2"
      }`}
    >
      {roleLabel(role)}
    </span>
  );
}

export function TeamManager({
  accountId,
  members,
  invitations,
  isOwner,
  limit,
  used,
}: {
  /** Organisation, die diese Seite zeigt (Schutz gegen Org-Wechsel in einem anderen Tab). */
  accountId: string;
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
  /** Team-Grenze des Tarifs (null = unbegrenzt). */
  limit: number | null;
  /** Mitglieder + offene Einladungen. */
  used: number;
}) {
  const full = limit !== null && used >= limit;
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const [pending, start] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Steply-Abfrage statt grauem Browser-Dialog (wie im Editor und in der Wissensdatenbank).
  const [confirm, confirmDialog] = useConfirm();

  const copy = (token: string) => {
    navigator.clipboard
      .writeText(`${window.location.origin}/invite/${token}`)
      .then(() => toast.success("Einladungslink kopiert"))
      .catch(() => toast.error("Kopieren fehlgeschlagen"));
  };

  const onInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("accountId", accountId);
    start(async () => {
      const r = await inviteMember(fd);
      setResult(r);
      if (r.ok) form.reset();
    });
  };

  return (
    <div className="grid gap-[18px]">
      {confirmDialog}
      {isOwner && (
        <SettingsCard
          title="Mitglieder einladen"
          icon={UserPlus}
          description="Die eingeladene Person bekommt eine E-Mail mit einem Beitritts-Link."
          aside={
            limit !== null ? (
              <span className="rounded-full bg-line-2 px-2 py-0.5 text-[11px] font-black text-ink-2" data-testid="team-seats">
                {used} von {limit} {limit === 1 ? "Platz" : "Plätzen"}
              </span>
            ) : undefined
          }
        >
          {full && (
            <p className="rounded-xl bg-line-2 px-3 py-2 text-sm font-bold text-ink-2">
              {limit === 1
                ? "Im kostenlosen Tarif arbeiten Sie allein."
                : `Ihr Tarif erlaubt ${limit} Personen im Team (inkl. offener Einladungen).`}{" "}
              <Link href="/app/settings/tarif" className="font-extrabold text-primary underline underline-offset-2">
                Tarif ansehen
              </Link>
            </p>
          )}
          <form ref={formRef} onSubmit={onInvite} className="flex flex-wrap items-end gap-2.5">
            <div className="grid min-w-[12rem] flex-1 gap-1.5">
              <FieldLabel htmlFor="invite-email">E-Mail</FieldLabel>
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                placeholder="kollegin@firma.de"
                className={settingsInputClass}
              />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="invite-role">Rolle</FieldLabel>
              <div className="relative">
                <select
                  id="invite-role"
                  name="role"
                  defaultValue="editor"
                  className={`${settingsInputClass} cursor-pointer appearance-none pr-9`}
                >
                  <option value="member">Mitarbeiter</option>
                  <option value="editor">Bearbeiter</option>
                  <option value="owner">Inhaber</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <Button type="submit" disabled={pending || full} className="h-10">
              <Mail className="size-4" /> Einladen
            </Button>
          </form>

          {result && (
            <div
              role="status"
              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                result.ok ? "bg-teal-soft text-teal-text" : "bg-no-soft text-no"
              }`}
            >
              {result.message}
              {result.link && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(result.link!).then(
                      () => toast.success("Link kopiert"),
                      () => toast.error("Kopieren fehlgeschlagen"),
                    );
                  }}
                  className="mt-1 flex items-center gap-1 break-all text-xs font-extrabold text-primary hover:underline"
                >
                  <Copy className="size-3 shrink-0" /> {result.link}
                </button>
              )}
            </div>
          )}
          <ul className="grid gap-0.5 text-xs text-muted-foreground">
            {ROLES.slice()
              .reverse()
              .map((r) => (
                <li key={r}>
                  <b className="font-extrabold text-ink-2">{ROLE_LABEL[r]}:</b> {ROLE_HINT[r]}
                </li>
              ))}
          </ul>
        </SettingsCard>
      )}

      <SettingsCard
        title={`Mitglieder (${members.length})`}
        icon={Users}
        description={isOwner ? undefined : "Mitglieder einladen oder entfernen können nur Inhaber."}
      >
        <ul className="-mx-[18px] -mb-4 min-w-0 divide-y-2 divide-line-2 border-t-2 border-line-2">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-[18px] py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-black text-coral-text">
                {((m.name || m.email)[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">
                  {m.name || m.email} {m.isYou && <span className="font-semibold text-muted-foreground">(Sie)</span>}
                </div>
                {m.name && <div className="truncate text-xs font-semibold text-muted-foreground">{m.email}</div>}
              </div>
              {isOwner && !(m.role === "owner" && ownerCount <= 1) ? (
                <select
                  aria-label={`Rolle von ${m.email}`}
                  value={asRole(m.role)}
                  disabled={pending}
                  onChange={(e) => {
                    const next = e.target.value;
                    const select = e.target;
                    const prevLabel = roleLabel(m.role);
                    const apply = () =>
                      start(async () => {
                        try {
                          unwrap(await changeMemberRole(accountId, m.userId, next));
                          toast.success(`${m.email} ist jetzt ${roleLabel(next)}.`);
                        } catch (err) {
                          toast.error(errorText(err, "Rolle konnte nicht geändert werden"));
                        }
                      });
                    if (!m.isYou) {
                      apply();
                      return;
                    }
                    // Eigene Rolle: Folge klar benennen, Auswahl bei „Abbrechen“ zurücksetzen.
                    void confirm({
                      title: "Eigene Rolle ändern?",
                      description: `Ihre Rolle wechselt von „${prevLabel}“ zu „${roleLabel(next)}“. Danach können Sie das Team nicht mehr verwalten – auch diese Änderung nicht zurücknehmen.`,
                      confirmLabel: "Rolle ändern",
                      destructive: true,
                    }).then((ok) => {
                      if (ok) apply();
                      else select.value = asRole(m.role);
                    });
                  }}
                  className="shrink-0 cursor-pointer rounded-full border-2 border-line bg-card px-2 py-0.5 text-[12px] font-black text-ink-2"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <RolePill role={m.role} />
              )}
              {isOwner && !m.isYou && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    void confirm({
                      title: `„${m.email}“ aus dem Team entfernen?`,
                      description:
                        "Die Person verliert sofort den Zugriff auf dieses Konto. Angelegte Anleitungen bleiben erhalten.",
                      confirmLabel: "Entfernen",
                      destructive: true,
                    }).then((ok) => {
                      if (!ok) return;
                      start(async () => {
                        try {
                          unwrap(await removeMember(accountId, m.userId));
                          toast.success(`${m.email} wurde aus dem Team entfernt.`);
                        } catch (e) {
                          toast.error(errorText(e, "Entfernen fehlgeschlagen"));
                        }
                      });
                    });
                  }}
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-no-soft hover:text-no"
                  aria-label={`${m.email} entfernen`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </SettingsCard>

      {invitations.length > 0 && (
        <SettingsCard title={`Offene Einladungen (${invitations.length})`} icon={Mail}>
          <ul className="-mx-[18px] -mb-4 divide-y-2 divide-line-2 border-t-2 border-line-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 px-[18px] py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {inv.email}
                  <span
                    className={`block text-xs font-semibold ${inv.expired ? "text-no" : "text-muted-foreground"}`}
                    data-testid="invite-expiry"
                  >
                    {inv.expired
                      ? "Abgelaufen – bitte neu senden"
                      : `Gültig bis ${new Date(inv.expiresAt).toLocaleDateString("de-DE")}`}
                  </span>
                </span>
                <RolePill role={inv.role} />
                <div className="flex items-center gap-1">
                  {!inv.expired && (
                    <Button variant="outline" size="sm" onClick={() => copy(inv.token)}>
                      <Copy className="size-4" /> Link
                    </Button>
                  )}
                  {isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await resendInvitation(inv.id);
                          setResult(r);
                          if (r.ok) toast.success(`Neue Einladung an ${inv.email} – gültig 14 Tage.`);
                          else toast.error(r.message);
                        })
                      }
                    >
                      <Mail className="size-4" /> Neu senden
                    </Button>
                  )}
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          try {
                            unwrap(await revokeInvitation(inv.id));
                            toast.success("Einladung zurückgezogen");
                          } catch (e) {
                            toast.error(errorText(e, "Zurückziehen fehlgeschlagen"));
                          }
                        })
                      }
                    >
                      <X className="size-4" /> Zurückziehen
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
    </div>
  );
}

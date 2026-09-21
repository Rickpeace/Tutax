"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, Copy, Mail, X, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteMember, revokeInvitation, removeMember, type InviteResult } from "@/app/app/settings/team/actions";
import { FieldLabel, SettingsCard, settingsInputClass } from "@/components/app/settings-ui";

type Member = { userId: string; role: string; email: string; isYou: boolean };
type Invitation = { id: string; email: string; role: string; token: string };

const roleLabel = (role: string) => (role === "owner" ? "Inhaber" : "Bearbeiter");

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
  members,
  invitations,
  isOwner,
}: {
  members: Member[];
  invitations: Invitation[];
  isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    start(async () => {
      const r = await inviteMember(fd);
      setResult(r);
      if (r.ok) form.reset();
    });
  };

  return (
    <div className="grid gap-[18px]">
      {isOwner && (
        <SettingsCard
          title="Mitglieder einladen"
          icon={UserPlus}
          description="Die eingeladene Person bekommt eine E-Mail mit einem Beitritts-Link."
        >
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
                  <option value="editor">Bearbeiter</option>
                  <option value="owner">Inhaber</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <Button type="submit" disabled={pending} className="h-10">
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
          <p className="text-xs text-muted-foreground">
            „Bearbeiter“ pflegen Anleitungen, Wissen und das Design der Hilfe-Seite. Das Team
            verwalten nur „Inhaber“.
          </p>
        </SettingsCard>
      )}

      <SettingsCard
        title={`Mitglieder (${members.length})`}
        icon={Users}
        description={isOwner ? undefined : "Mitglieder einladen oder entfernen können nur Inhaber."}
      >
        <ul className="-mx-[18px] -mb-4 divide-y-2 divide-line-2 border-t-2 border-line-2">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-[18px] py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-black text-coral-text">
                {(m.email[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                {m.email} {m.isYou && <span className="font-semibold text-muted-foreground">(Sie)</span>}
              </div>
              <RolePill role={m.role} />
              {isOwner && !m.isYou && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (
                      confirm(
                        `„${m.email}“ wirklich aus dem Team entfernen? Die Person verliert sofort den Zugriff.`,
                      )
                    )
                      start(async () => {
                        try {
                          await removeMember(m.userId);
                          toast.success(`${m.email} wurde aus dem Team entfernt.`);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Entfernen fehlgeschlagen");
                        }
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
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{inv.email}</span>
                <RolePill role={inv.role} />
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => copy(inv.token)}>
                    <Copy className="size-4" /> Link
                  </Button>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await revokeInvitation(inv.id);
                          toast.success("Einladung zurückgezogen");
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

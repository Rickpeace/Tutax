"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, Copy, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteMember, revokeInvitation, removeMember, type InviteResult } from "@/app/app/settings/team/actions";

type Member = { userId: string; role: string; email: string; isYou: boolean };
type Invitation = { id: string; email: string; role: string; token: string };

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

  const roleBadge = (role: string) =>
    role === "owner"
      ? "rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-primary"
      : "rounded-md bg-line-2 px-2 py-0.5 text-xs font-bold text-muted-foreground";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Laden Sie Mitarbeiter ein, die gemeinsam an Anleitungen arbeiten.
        </p>
      </div>

      {isOwner && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-ink">
            <UserPlus className="size-4 text-primary" /> Mitarbeiter einladen
          </h3>
          <form ref={formRef} onSubmit={onInvite} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label htmlFor="invite-email">E-Mail</Label>
              <Input id="invite-email" name="email" type="email" required placeholder="kollegin@firma.de" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Rolle</Label>
              <select
                id="invite-role"
                name="role"
                defaultValue="editor"
                className="h-9 rounded-md border border-border bg-card px-2 text-sm text-ink"
              >
                <option value="editor">Bearbeiter</option>
                <option value="owner">Inhaber</option>
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              <Mail className="size-4" /> Einladen
            </Button>
          </form>

          {result && (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                result.ok ? "bg-yes-soft text-ink-2" : "bg-no-soft text-no"
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
                  className="mt-1 flex items-center gap-1 break-all text-xs font-semibold text-primary hover:underline"
                >
                  <Copy className="size-3 shrink-0" /> {result.link}
                </button>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            „Bearbeiter" darf Anleitungen, Wissen & Branding bearbeiten. Konto/Abo bleiben dem Inhaber.
          </p>
        </section>
      )}

      {/* Mitglieder */}
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Mitglieder ({members.length})
        </h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                {(m.email[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {m.email} {m.isYou && <span className="text-muted-foreground">(Sie)</span>}
                </div>
              </div>
              <span className={roleBadge(m.role)}>{m.role === "owner" ? "Inhaber" : "Bearbeiter"}</span>
              {isOwner && !m.isYou && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`${m.email} aus dem Team entfernen?`))
                      start(async () => {
                        try {
                          await removeMember(m.userId);
                          toast.success("Entfernt");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Fehler");
                        }
                      });
                  }}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-no-soft hover:text-no"
                  aria-label="Entfernen"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Offene Einladungen */}
      {invitations.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Offene Einladungen ({invitations.length})
          </h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3">
                <Mail className="size-4 text-muted-foreground" />
                <span className="text-sm text-ink">{inv.email}</span>
                <span className={roleBadge(inv.role)}>{inv.role === "owner" ? "Inhaber" : "Bearbeiter"}</span>
                <div className="ml-auto flex items-center gap-1">
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
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

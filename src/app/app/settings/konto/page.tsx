import Link from "next/link";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "@/components/app/password-form";
import { EmailForm } from "@/components/app/email-form";
import { reopenOnboarding } from "./actions";
import { Button } from "@/components/ui/button";

export default async function KontoPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Konto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ihre Zugangsdaten und Kontoeinstellungen.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              E-Mail
            </dt>
            <dd className="mt-1 text-sm text-ink">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organisation
            </dt>
            <dd className="mt-1 text-sm text-ink">
              {account.name}{" "}
              <Link href="/app/settings/branding" className="text-primary hover:underline">
                (ändern)
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 font-bold text-ink">E-Mail-Adresse ändern</h3>
        <EmailForm current={user?.email ?? ""} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 font-bold text-ink">Passwort ändern</h3>
        <PasswordForm />
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-bold text-ink">Einrichtung</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Den Einrichtungs-Assistenten (Organisation, Design) noch einmal durchlaufen.
        </p>
        <form action={reopenOnboarding} className="mt-3">
          <Button type="submit" variant="outline" size="sm">
            Einrichtung erneut zeigen
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-no/30 bg-no-soft/40 p-5">
        <h3 className="font-bold text-no">Konto löschen</h3>
        <p className="mt-1 text-sm text-ink-2">
          Löscht Ihr Konto samt aller Tutorials und Bilder unwiderruflich. (In Kürze
          verfügbar – bitte vorerst den Support kontaktieren.)
        </p>
      </section>
    </div>
  );
}

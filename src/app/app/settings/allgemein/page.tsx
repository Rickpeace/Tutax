import { Building2, RotateCcw, Trash2, ArrowLeftRight } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { AccountSwitcher } from "@/components/app/account-switcher";
import { OrgNameForm } from "@/components/app/org-name-form";
import { SettingsCard, SettingsHeader } from "@/components/app/settings-ui";
import { reopenOnboarding } from "../konto/actions";

export default async function AllgemeinPage() {
  const { account, memberships } = await requireAccount();

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Arbeitsbereich"
        title="Allgemein"
        lead="Grunddaten Ihrer Organisation in Steply."
      />

      <SettingsCard title="Organisation" icon={Building2}>
        <OrgNameForm initialName={account.name} slug={account.slug} />
      </SettingsCard>

      {memberships.length > 1 && (
        <SettingsCard
          title="Aktive Organisation"
          icon={ArrowLeftRight}
          description="Sie gehören zu mehreren Organisationen. Hier wählen Sie, welche Sie gerade verwalten."
        >
          <div className="max-w-sm">
            <AccountSwitcher
              currentId={account.id}
              currentName={account.name}
              memberships={memberships}
              full
            />
          </div>
        </SettingsCard>
      )}

      <SettingsCard
        title="Einrichtung"
        icon={RotateCcw}
        description="Den Einrichtungs-Assistenten (Organisation, Design, Sprachen) noch einmal durchlaufen."
      >
        <form action={reopenOnboarding}>
          <Button type="submit" variant="outline" size="sm">
            Einrichtung erneut zeigen
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard
        tone="danger"
        title="Organisation löschen"
        icon={Trash2}
        aside={
          <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-black text-muted-foreground">
            In Kürze
          </span>
        }
        description="Löscht Ihre Organisation samt aller Anleitungen und Bilder unwiderruflich. Das geht hier in Kürze selbst – bis dahin kontaktieren Sie bitte den Steply-Support."
      />
    </div>
  );
}

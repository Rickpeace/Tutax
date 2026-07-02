import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateDe } from "@/lib/format";
import type { Step, StepBranch, Tutorial } from "@/lib/types";
import { LernenViewer } from "@/components/app/lernen-viewer";

export default async function LernenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account, userId, memberships } = await requireAccount();
  const supabase = await createClient();
  const isOwner = memberships.find((m) => m.id === account.id)?.role === "owner";

  const { data: tutorial } = await supabase
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .single<Tutorial>();

  // Zugriff: Tutorial gehört zum aktiven Konto.
  if (!tutorial || tutorial.account_id !== account.id) notFound();
  // Lern-Zugriff (Welle 20): intern ODER öffentlich-mit-in_lernen (beide mit Nachweis).
  // Öffentliche OHNE in_lernen gehören nicht in den Lernbereich -> auf die Hilfe-Seite,
  // sofern veröffentlicht + Slug vorhanden, sonst notFound.
  const inLernen = tutorial.visibility === "internal" || tutorial.in_lernen;
  if (!inLernen) {
    if (tutorial.status === "published" && tutorial.slug) {
      redirect(`/h/${account.slug}/${tutorial.slug}`);
    }
    notFound();
  }

  const { data: steps } = await supabase
    .from("steps")
    .select("*")
    .eq("tutorial_id", id)
    .order("position", { ascending: true })
    .returns<Step[]>();
  const stepIds = (steps ?? []).map((s) => s.id);

  const [{ data: branches }, { data: myCompletion }] = await Promise.all([
    stepIds.length
      ? supabase.from("step_branches").select("*").in("step_id", stepIds).returns<StepBranch[]>()
      : Promise.resolve({ data: [] as StepBranch[] }),
    supabase
      .from("tutorial_completions")
      .select("completed_at")
      .eq("tutorial_id", id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // Bilder: SIGNIERTE URLs aus dem PRIVATEN Bucket (interne Tutorials haben keine
  // public Kopie). Parallel signieren -> kein Wasserfall.
  const admin = createAdminClient();
  const imageUrls: Record<string, string> = {};
  const withImage = (steps ?? []).filter((s) => s.image_path);
  const signed = await Promise.all(
    withImage.map((s) => admin.storage.from("tutorial-images").createSignedUrl(s.image_path!, 3600)),
  );
  withImage.forEach((s, i) => {
    const url = signed[i].data?.signedUrl;
    if (url) imageUrls[s.id] = url;
  });

  // Owner-Zusatz: Schulungsnachweis-Tabelle (alle Mitglieder + Status).
  const trainingRecord = isOwner ? await loadTrainingRecord(account.id, id, admin) : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
      <Link
        href="/app/lernen"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Lernen
      </Link>
      <h1 className="mb-4 text-xl font-bold text-ink">{tutorial.title}</h1>

      <LernenViewer
        tutorialId={id}
        rootId={tutorial.root_step_id}
        steps={steps ?? []}
        branches={branches ?? []}
        imageUrls={imageUrls}
        completion={{
          completed: !!myCompletion,
          completedAt: myCompletion?.completed_at ?? null,
        }}
      />

      {isOwner && trainingRecord.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold text-ink">Schulungsnachweis</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {trainingRecord.map((m) => (
                  <tr key={m.userId} className="border-b border-line-2 last:border-b-0">
                    <td className="px-4 py-2.5 text-ink-2">{m.email}</td>
                    <td className="px-4 py-2.5 text-right">
                      {m.completedAt ? (
                        <span className="font-medium text-yes">✓ {dateDe(m.completedAt)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

/** Alle Mitglieder des Kontos + ob/wann sie dieses Tutorial absolviert haben. */
async function loadTrainingRecord(
  accountId: string,
  tutorialId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ userId: string; email: string; completedAt: string | null }[]> {
  const [{ data: memberRows }, { data: comps }] = await Promise.all([
    admin.from("account_members").select("user_id").eq("account_id", accountId),
    admin
      .from("tutorial_completions")
      .select("user_id, completed_at")
      .eq("tutorial_id", tutorialId),
  ]);
  const rows = memberRows ?? [];
  const doneBy = new Map((comps ?? []).map((c) => [c.user_id, c.completed_at as string]));
  const userRes = await Promise.all(rows.map((m) => admin.auth.admin.getUserById(m.user_id)));
  return rows.map((m, i) => ({
    userId: m.user_id,
    email: userRes[i].data?.user?.email ?? "—",
    completedAt: doneBy.get(m.user_id) ?? null,
  }));
}

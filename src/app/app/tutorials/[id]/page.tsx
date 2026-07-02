import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import type { Step, StepBranch, Tutorial } from "@/lib/types";
import { Builder } from "@/components/builder/builder";
import { TutorialHeader } from "@/components/builder/tutorial-header";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: tutorial } = await supabase
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .single<Tutorial>();
  if (!tutorial) notFound();

  const [{ data: categories }, { data: acc }, { data: translations }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name")
      .eq("account_id", account.id)
      .order("position", { ascending: true }),
    // Aktivierte Zusatzsprachen (steuert den „Übersetzen“-Button im Header).
    supabase.from("accounts").select("languages").eq("id", account.id).single(),
    // Übersetzungsstatus für den „veraltet“-Punkt am Button.
    supabase.from("tutorial_translations").select("lang, stale").eq("tutorial_id", id),
  ]);

  const languages = ((acc?.languages as string[] | null) ?? []).filter(
    isExtraLang,
  ) as ExtraLang[];
  // „veraltet“, wenn eine aktivierte Sprache fehlt ODER als stale markiert ist.
  const byLang = new Map((translations ?? []).map((t) => [t.lang as string, t.stale as boolean]));
  const translationsStale =
    languages.length > 0 &&
    languages.some((l) => !byLang.has(l) || byLang.get(l) === true);

  const { data: steps } = await supabase
    .from("steps")
    .select("*")
    .eq("tutorial_id", id)
    .order("position", { ascending: true })
    .returns<Step[]>();

  const stepIds = (steps ?? []).map((s) => s.id);
  const [{ data: branches }, { data: videoJob }] = await Promise.all([
    stepIds.length
      ? supabase.from("step_branches").select("*").in("step_id", stepIds).returns<StepBranch[]>()
      : Promise.resolve({ data: [] as StepBranch[] }),
    // Gibt es ein Quell-Video? Dann bieten ALLE Schritte „Bild aus Video wählen" an —
    // auch manuell angelegte ohne Bild (vorher gab es den Knopf nur bei Schritten mit Bild).
    supabase
      .from("video_jobs")
      .select("id")
      .eq("tutorial_id", id)
      .not("video_path", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      <TutorialHeader
        tutorialId={id}
        initialTitle={tutorial.title}
        published={tutorial.status === "published"}
        visibility={tutorial.visibility}
        categories={categories ?? []}
        categoryId={tutorial.category_id}
        languages={languages}
        translationsStale={translationsStale}
      />

      <Builder
        tutorialId={id}
        steps={steps ?? []}
        branches={branches ?? []}
        rootStepId={tutorial.root_step_id}
        hasSourceVideo={!!videoJob}
      />
    </main>
  );
}

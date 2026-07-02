import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import type { Step, StepBranch, Tutorial } from "@/lib/types";
import { Builder } from "@/components/builder/builder";
import { TutorialHeader } from "@/components/builder/tutorial-header";

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

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("account_id", account.id)
    .order("position", { ascending: true });

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

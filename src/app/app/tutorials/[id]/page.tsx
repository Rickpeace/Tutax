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
  const { data: branches } = stepIds.length
    ? await supabase
        .from("step_branches")
        .select("*")
        .in("step_id", stepIds)
        .returns<StepBranch[]>()
    : { data: [] as StepBranch[] };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      <TutorialHeader
        tutorialId={id}
        initialTitle={tutorial.title}
        published={tutorial.status === "published"}
        categories={categories ?? []}
        categoryId={tutorial.category_id}
      />

      <Builder
        tutorialId={id}
        steps={steps ?? []}
        branches={branches ?? []}
        rootStepId={tutorial.root_step_id}
      />
    </main>
  );
}

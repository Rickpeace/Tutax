import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Eye } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import type { Step, StepBranch, Tutorial } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Builder } from "@/components/builder/builder";
import { CategoryPicker } from "@/components/builder/category-picker";
import { DriftCheckButton } from "@/components/builder/drift-check-button";

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
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/app" />}
      >
        <ChevronLeft className="size-4" /> Zurück
      </Button>

      <div className="mt-3 mb-5">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">
          {tutorial.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {tutorial.status === "published" ? "Veröffentlicht" : "Entwurf"}
          </span>
          <CategoryPicker
            tutorialId={id}
            categories={categories ?? []}
            currentCategoryId={tutorial.category_id}
          />
          <DriftCheckButton tutorialId={id} />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/app/preview/${id}`} target="_blank" rel="noopener noreferrer" />}
          >
            <Eye className="size-4" /> Vorschau
          </Button>
        </div>
      </div>

      <Builder
        tutorialId={id}
        steps={steps ?? []}
        branches={branches ?? []}
        rootStepId={tutorial.root_step_id}
      />
    </main>
  );
}

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle } from "@/lib/theme";
import { publicImageUrl } from "@/lib/public-image";
import { HubBrowser, type HubTutorial } from "@/components/viewer/hub-browser";
import { ChatWidget } from "@/components/viewer/chat-widget";

async function load(accountSlug: string) {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, slug")
    .eq("slug", accountSlug)
    .single();
  if (!account) return null;

  const [{ data: tutorials }, { data: categories }, { data: theme }] = await Promise.all([
    admin
      .from("tutorials")
      .select("id, title, description, slug, category_id")
      .eq("account_id", account.id)
      .eq("status", "published")
      .order("updated_at", { ascending: false }),
    admin
      .from("categories")
      .select("id, name, position")
      .eq("account_id", account.id)
      .order("position", { ascending: true }),
    admin.from("themes").select("tokens, logo_path").eq("account_id", account.id).single(),
  ]);

  return { account, tutorials: tutorials ?? [], categories: categories ?? [], theme };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ account_slug: string }>;
}): Promise<Metadata> {
  const { account_slug } = await params;
  const data = await load(account_slug);
  if (!data) return { title: "Nicht gefunden" };
  return { title: `Hilfe & Anleitungen · ${data.account.name}` };
}

export default async function HubPage({
  params,
}: {
  params: Promise<{ account_slug: string }>;
}) {
  const { account_slug } = await params;
  const data = await load(account_slug);
  if (!data) notFound();

  const { account, tutorials, categories, theme } = data;
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const items: HubTutorial[] = tutorials
    .filter((t) => t.slug)
    .map((t) => ({
      title: t.title,
      description: t.description,
      slug: t.slug as string,
      category: (t.category_id && catName.get(t.category_id)) || "Sonstiges",
    }));

  const order = [...categories.map((c) => c.name), "Sonstiges"];
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const logoUrl = theme?.logo_path ? publicImageUrl(theme.logo_path) : null;

  return (
    <main
      className="min-h-screen"
      style={{ ...brandStyle(theme?.tokens), background: "var(--brand-bg)" }}
    >
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-5 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="size-11 rounded-xl border border-black/5 bg-white object-contain p-1"
            />
          ) : (
            <div
              className="flex size-11 items-center justify-center rounded-xl text-lg font-extrabold text-white"
              style={{ background: "var(--brand-accent)" }}
            >
              {initial}
            </div>
          )}
          <div>
            <div className="text-lg font-extrabold text-[var(--brand-ink)]">
              {account.name}
            </div>
            <div className="text-sm text-muted-foreground">Hilfe &amp; Anleitungen</div>
          </div>
        </div>

        <HubBrowser accountSlug={account.slug} items={items} order={order} />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          powered by Tutax
        </p>
      </div>
      <ChatWidget accountSlug={account.slug} accountName={account.name} />
    </main>
  );
}

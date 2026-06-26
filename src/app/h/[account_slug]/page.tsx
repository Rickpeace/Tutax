import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandStyle } from "@/lib/theme";
import { publicImageUrl } from "@/lib/public-image";
import { getCatalog } from "@/lib/templates";
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

  const [catalog, { data: categories }, { data: theme }] = await Promise.all([
    getCatalog(admin, account.id),
    admin.from("categories").select("id, name, position").eq("account_id", account.id).order("position", { ascending: true }),
    admin.from("themes").select("tokens, logo_path").eq("account_id", account.id).single(),
  ]);

  return { account, catalog, categories: categories ?? [], theme };
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

  const { account, catalog, categories, theme } = data;
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const items: HubTutorial[] = catalog
    .filter((e) => e.visible && e.slug)
    .map((e) => ({
      title: e.title,
      description: e.description,
      slug: e.slug as string,
      category: (e.categoryId && catName.get(e.categoryId)) || "Sonstiges",
    }));

  const order = [...categories.map((c) => c.name), "Sonstiges"];
  const initial = account.name.trim().charAt(0).toUpperCase() || "?";
  const logoUrl = theme?.logo_path ? publicImageUrl(theme.logo_path) : null;

  return (
    <main className="min-h-screen" style={{ ...brandStyle(theme?.tokens), background: "var(--brand-bg)" }}>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-5 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-11 rounded-xl border border-black/5 bg-white object-contain p-1" />
          ) : (
            <div
              className="flex size-11 items-center justify-center rounded-xl text-lg font-extrabold text-white"
              style={{ background: "var(--brand-accent)" }}
            >
              {initial}
            </div>
          )}
          <div>
            <div className="text-lg font-extrabold text-[var(--brand-ink)]">{account.name}</div>
            <div className="text-sm text-muted-foreground">Hilfe &amp; Anleitungen</div>
          </div>
        </div>

        <HubBrowser accountSlug={account.slug} items={items} order={order} />

        <p className="mt-8 text-center text-xs text-muted-foreground">powered by Tutax</p>
      </div>
      <ChatWidget accountSlug={account.slug} accountName={account.name} />
    </main>
  );
}

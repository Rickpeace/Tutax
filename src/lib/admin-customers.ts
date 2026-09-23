import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Daten für die Admin-Kundenverwaltung (/admin/kunden). Nur nach requireAdmin() aufrufen —
// liest mit Service-Rechten über ALLE Konten.

export type PlanKey = "free" | "pro" | "business";
export const planOf = (p: string | null | undefined): PlanKey =>
  p === "business" ? "business" : p === "pro" ? "pro" : "free";

/** Organisationen, die sich im Admin nicht löschen lassen (eigene Doku + Landing-Demo). */
export const PROTECTED_SLUGS = new Set(["steply", "demo"]);

export type CustomerRow = {
  id: string;
  name: string;
  slug: string;
  plan: PlanKey;
  createdAt: string;
  onboarded: boolean;
  ownerEmails: string[];
  members: number;
  pendingInvites: number;
  tutorials: number;
  published: number;
  articles: number;
  views30: number;
  chats30: number;
  extension: boolean;
  automations: number;
  videos: number;
  /** Letzte Anmeldung eines Teammitglieds (ISO) oder null. */
  lastActive: string | null;
};

export type AuthUserInfo = { email: string; lastSignIn: string | null; createdAt: string };

const DAY = 86_400_000;

/** Alle Zeilen einer Abfrage, seitenweise (PostgREST liefert höchstens 1000 je Antwort). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Alle Auth-Nutzer (E-Mail, letzte Anmeldung), seitenweise. */
export async function loadAuthUsers(admin: SupabaseClient): Promise<Map<string, AuthUserInfo>> {
  const map = new Map<string, AuthUserInfo>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      map.set(u.id, { email: u.email ?? "", lastSignIn: u.last_sign_in_at ?? null, createdAt: u.created_at });
    }
    if (data.users.length < 1000) return map;
  }
}

const countBy = <T>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return m;
};

export async function loadCustomerList(): Promise<CustomerRow[]> {
  const admin = createAdminClient();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const [accounts, members, invites, tutorials, articles, events, tokens, automations, videos, users] =
    await Promise.all([
      fetchAll<{ id: string; name: string; slug: string; plan: string | null; created_at: string; onboarded: boolean | null }>(
        (a, b) => admin.from("accounts").select("id, name, slug, plan, created_at, onboarded").order("created_at", { ascending: false }).range(a, b),
      ),
      fetchAll<{ account_id: string; user_id: string; role: string }>((a, b) =>
        admin.from("account_members").select("account_id, user_id, role").range(a, b),
      ),
      fetchAll<{ account_id: string }>((a, b) =>
        admin.from("invitations").select("account_id").eq("status", "pending").range(a, b),
      ),
      fetchAll<{ account_id: string; status: string }>((a, b) =>
        admin.from("tutorials").select("account_id, status").eq("is_template", false).not("account_id", "is", null).range(a, b),
      ),
      fetchAll<{ account_id: string }>((a, b) => admin.from("kb_articles").select("account_id").range(a, b)),
      fetchAll<{ account_id: string; type: string }>((a, b) =>
        admin.from("events").select("account_id, type").gte("created_at", since30).in("type", ["view", "chat"]).range(a, b),
      ),
      fetchAll<{ account_id: string }>((a, b) => admin.from("recorder_tokens").select("account_id").range(a, b)),
      fetchAll<{ account_id: string }>((a, b) => admin.from("automations").select("account_id").range(a, b)),
      fetchAll<{ account_id: string }>((a, b) =>
        admin.from("video_jobs").select("account_id").neq("kind", "render").range(a, b),
      ),
      loadAuthUsers(admin),
    ]);

  const membersBy = new Map<string, { user_id: string; role: string }[]>();
  for (const m of members) membersBy.set(m.account_id, [...(membersBy.get(m.account_id) ?? []), m]);
  const inv = countBy(invites, (r) => r.account_id);
  const tut = countBy(tutorials, (r) => r.account_id);
  const pub = countBy(tutorials.filter((t) => t.status === "published"), (r) => r.account_id);
  const art = countBy(articles, (r) => r.account_id);
  const views = countBy(events.filter((e) => e.type === "view"), (r) => r.account_id);
  const chats = countBy(events.filter((e) => e.type === "chat"), (r) => r.account_id);
  const tok = countBy(tokens, (r) => r.account_id);
  const auto = countBy(automations, (r) => r.account_id);
  const vid = countBy(videos, (r) => r.account_id);

  return accounts.map((a) => {
    const ms = membersBy.get(a.id) ?? [];
    const lastActive = ms
      .map((m) => users.get(m.user_id)?.lastSignIn ?? null)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      plan: planOf(a.plan),
      createdAt: a.created_at,
      onboarded: !!a.onboarded,
      ownerEmails: ms.filter((m) => m.role === "owner").map((m) => users.get(m.user_id)?.email ?? "?"),
      members: ms.length,
      pendingInvites: inv.get(a.id) ?? 0,
      tutorials: tut.get(a.id) ?? 0,
      published: pub.get(a.id) ?? 0,
      articles: art.get(a.id) ?? 0,
      views30: views.get(a.id) ?? 0,
      chats30: chats.get(a.id) ?? 0,
      extension: (tok.get(a.id) ?? 0) > 0,
      automations: auto.get(a.id) ?? 0,
      videos: vid.get(a.id) ?? 0,
      lastActive,
    };
  });
}

export type CustomerDetail = {
  account: { id: string; name: string; slug: string; plan: PlanKey; createdAt: string; onboarded: boolean; languages: string[]; sourceUrl: string | null };
  members: { userId: string; email: string; role: string; lastSignIn: string | null; joinedApp: string | null }[];
  invites: { id: string; email: string; role: string; createdAt: string }[];
  tutorials: { id: string; title: string; status: string; visibility: string; slug: string | null; updatedAt: string }[];
  tutorialTotal: number;
  articles: { total: number; published: number };
  usage: { type: string; last30: number; total: number }[];
  extension: { label: string | null; lastUsed: string | null; createdAt: string; email: string }[];
  automations: number;
  videos: { status: string; title: string | null; createdAt: string; error: string | null }[];
};

export async function loadCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const admin = createAdminClient();
  const { data: acc } = await admin
    .from("accounts")
    .select("id, name, slug, plan, created_at, onboarded, languages")
    .eq("id", id)
    .maybeSingle();
  if (!acc) return null;
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const [
    { data: members },
    { data: invites },
    { data: tuts, count: tutCount },
    { data: arts },
    events,
    { data: tokens },
    { count: autoCount },
    { data: videos },
    { data: theme },
  ] = await Promise.all([
    admin.from("account_members").select("user_id, role").eq("account_id", id),
    admin.from("invitations").select("id, email, role, created_at").eq("account_id", id).eq("status", "pending").order("created_at", { ascending: false }),
    admin
      .from("tutorials")
      .select("id, title, status, visibility, slug, updated_at", { count: "exact" })
      .eq("account_id", id)
      .order("updated_at", { ascending: false })
      .limit(50),
    admin.from("kb_articles").select("status").eq("account_id", id),
    fetchAll<{ type: string; created_at: string }>((a, b) =>
      admin.from("events").select("type, created_at").eq("account_id", id).range(a, b),
    ),
    admin.from("recorder_tokens").select("user_id, label, last_used_at, created_at").eq("account_id", id).order("created_at", { ascending: false }),
    admin.from("automations").select("id", { count: "exact", head: true }).eq("account_id", id),
    admin.from("video_jobs").select("status, title, created_at, error").eq("account_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("themes").select("source_url").eq("account_id", id).maybeSingle(),
  ]);

  const userInfo = new Map<string, AuthUserInfo>();
  const ids = [...new Set([...(members ?? []).map((m) => m.user_id), ...(tokens ?? []).map((t) => t.user_id)])];
  await Promise.all(
    ids.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user) userInfo.set(uid, { email: data.user.email ?? "", lastSignIn: data.user.last_sign_in_at ?? null, createdAt: data.user.created_at });
    }),
  );

  const typeLabels = ["view", "chat", "feedback", "guide"];
  const usage = typeLabels.map((type) => ({
    type,
    last30: events.filter((e) => e.type === type && e.created_at >= since30).length,
    total: events.filter((e) => e.type === type).length,
  }));

  const roleOrder: Record<string, number> = { owner: 0, editor: 1, member: 2 };
  return {
    account: {
      id: acc.id,
      name: acc.name,
      slug: acc.slug,
      plan: planOf(acc.plan),
      createdAt: acc.created_at,
      onboarded: !!acc.onboarded,
      languages: (acc.languages as string[] | null) ?? [],
      sourceUrl: (theme?.source_url as string | null) ?? null,
    },
    members: (members ?? [])
      .map((m) => ({
        userId: m.user_id,
        email: userInfo.get(m.user_id)?.email ?? "?",
        role: m.role,
        lastSignIn: userInfo.get(m.user_id)?.lastSignIn ?? null,
        joinedApp: userInfo.get(m.user_id)?.createdAt ?? null,
      }))
      .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.email.localeCompare(b.email)),
    invites: (invites ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.created_at })),
    tutorials: (tuts ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      visibility: t.visibility,
      slug: t.slug,
      updatedAt: t.updated_at,
    })),
    tutorialTotal: tutCount ?? 0,
    articles: {
      total: (arts ?? []).length,
      published: (arts ?? []).filter((a) => a.status === "published").length,
    },
    usage,
    extension: (tokens ?? []).map((t) => ({
      label: t.label,
      lastUsed: t.last_used_at,
      createdAt: t.created_at,
      email: userInfo.get(t.user_id)?.email ?? "?",
    })),
    automations: autoCount ?? 0,
    videos: (videos ?? []).map((v) => ({ status: v.status, title: v.title, createdAt: v.created_at, error: v.error })),
  };
}

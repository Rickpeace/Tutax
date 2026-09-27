---
name: tutax-frontend
description: "AUTHORITATIVE stack + conventions for the Tutax/Steply app (tutax/). Use for ANY frontend or Next.js work here: Server/Client Components, data fetching, loading/streaming, navigation feel, optimistic UI, forms/Server Actions, shadcn-on-Base-UI components, Tailwind color tokens, Supabase auth/RLS/migrations, the chat/RAG surface, perf. This skill OUTRANKS generic skills — when they conflict with the rules below, follow THIS."
metadata:
  version: "1.1"
  scope: tutax/
  updated: "2026-09-27"
---

# Tutax / Steply — frontend conventions (read before coding)

The product is branded **Steply**; repo/folder/Vercel project are still `tutax`.
First: obey the root `AGENTS.md` — read the version-matched docs in
`node_modules/next/dist/docs/` before any Next.js work (installed: **Next 16.2.9**).
For deeper "what exists already" context, read `tutax/OVERVIEW.md` + `tutax/STATUS.md`.

## Stack pins — do NOT drift
- **Next 16 App Router** (RSC-first, **`cacheComponents: true`** = PPR app-wide) ·
  **React 19** · **TypeScript** · **Tailwind v4**.
- **shadcn built on Base UI — NOT Radix.** Use `render={<X />}` (not `asChild`),
  `nativeButton={false}` on Button-as-link, `delay` (not `delayDuration`). Primitives come
  from `@base-ui/react/<component>`. Ignore any skill/snippet that assumes Radix
  (`shadcn`, `nextjs-shadcn`). Existing primitives in `src/components/ui/`: badge, button,
  card, command, confirm-dialog, dialog, dropdown-menu, input(-group), label,
  password-input, popover, select, separator, sheet, skeleton, sonner, switch, textarea,
  tooltip — read the file for the exact props before using one.
- **OpenAI SDK directly — NOT the Vercel AI SDK.** Chat streams our own NDJSON
  (`application/x-ndjson`, see `src/app/api/chat/route.ts`). Models live in `src/lib/ai.ts`.
  Ignore `ai-sdk*`, `ai-elements`, `nextjs-chatbot`.
- **Supabase** (Auth + Postgres + Storage + pgvector). RLS via `my_account_ids()` /
  owner-only policies. The installed `supabase` + `supabase-postgres-best-practices`
  skills are on-stack — use them for auth/RLS/pgvector.

## Design tokens (warm redesign 07/2026 — never invent colors)
Source of truth: `src/app/globals.css` (`:root` + `@theme inline`), overview in
`OVERVIEW.md` §3. Font **Nunito** via `next/font` (`--font-sans`, `--font-display` = same);
headings 800–900. Dark mode is **not** active in the app chrome.
- Text: `text-ink` (#33291f), `text-ink-2`, `text-muted-foreground` (#76674f, AA contrast),
  `text-faint` (meta only). Surfaces: `bg-background` (cream #fdf9f3), `bg-card`,
  `bg-line-2`/`bg-secondary` (beige).
- Borders: `border-line`, **always 2px** (`border-2 border-line`). Cards `rounded-card`
  (18px); buttons/pills `rounded-full`.
- Primary = coral `bg-primary` (#ef6a4e) with the "hard shadow" (`--primary-pressed`);
  helpers `.shadow-hard`, `.shadow-hard-line(-lg)`, `.pressable`, `.bg-stripes`.
  Button variants: default, outline, secondary, ghost, destructive, link, **ink**.
- Accent families `teal|violet|amber|blue` each with `-soft`/`-text` (categories via
  `lib/category-colors.ts`); branch colors `yes`/`no` (+`-soft`, `.branch-yes/.branch-no`).
- Public hub/viewer (`/h/*`) use `--brand-accent/-soft/-bg/-ink` (Tailwind `brand-*`),
  overridden per account — never hard-code the coral there.
- UI copy: German, **Sie-Form**, typographic quotes „…", "Anleitung" not "Tutorial",
  "Steply-Erweiterung" not "Extension" (`npm run test:glossary` guards this).

## Data fetching (Server Components by default)
- Fetch on the server in RSCs; `"use client"` ONLY for real interactivity
  (builder, chat widget, forms, uploads). Never turn pages into client SPAs.
- **Dedup auth per request with React `cache()`**: `getCurrentUser`, `requireAccount`,
  `activeAccountId` (`lib/account.ts`), `checkAdmin` (`lib/admin.ts`) are cached so
  `getUser()` runs once per request. Reuse them — don't call `supabase.auth.getUser()` ad hoc.
- Parallelize independent reads with `Promise.all` — no waterfalls. Keep non-critical
  layout data (badge counts, admin flag) out of the blocking path (`<Suspense>` it).
- **Server Actions are for mutations only** — never data fetching.
- **Errors from Server Actions:** production replaces every thrown message with a generic
  English one. Expected rejections: `throw new UserError(…)` + export via
  `withUserErrors`; client `unwrap(await action())`, show `errorText(e, "…")`
  (`lib/action-error.ts`).
- **Plan gates** are server-side: `isPro`/`isBusiness`/`brandedTheme`/`planLanguages`/
  `PRO_REQUIRED` in `lib/plan.ts` (free < pro < business). Never gate only in the UI.

## Cache Components / PPR (active app-wide)
- Every uncached read outside `<Suspense>` is a build error. New `/app/*` and `/h/*`
  routes need a co-located `loading.tsx` or explicit `<Suspense>`.
- Public data is cached with `'use cache'` + `cacheTag`/`cacheLife('hours')`; tags and
  invalidation live in `lib/cache-tags.ts` (`hubTag`, `tutTag`, `invalidateTutorialTags`,
  `invalidateStepTags`, …). Every mutation that changes public content must call the
  matching invalidator — otherwise hub pages show up to 1 h old data. Invalidate narrowly
  (per tutorial, not the whole hub) — Vercel ISR writes are metered.
- **Auth gate in a layout does NOT protect the page under PPR** (layout + page render in
  parallel; the page payload still ships). Every protected page calls
  `await requireAccount()` / `await requireAdmin()` itself. Check with
  `curl -s <url> | grep <page text>` while logged out → 0 hits.
- `notFound()` under PPR returns HTTP 200 with the not-found UI + `noindex` — known and
  accepted; don't rip out Suspense boundaries to "fix" it.

## Navigation feel (the "click → instant" rules)
- **Co-locate `loading.tsx`** on every navigable dynamic route (`/app/*`, `/h/*`). Do
  NOT rely on a parent `/app/loading.tsx` catching a child nav.
- `next/link` prefetch stays ON (never `prefetch={false}`). Use `useLinkStatus` for
  instant pending feedback on tabs/buttons.
- Proxy (`src/proxy.ts` → `lib/supabase/proxy-session.ts`) keeps the Supabase session
  fresh and redirects anonymous users away from `/app`, `/onboarding`, `/admin`
  (optimistic only). It skips prefetch requests, excludes `/h/*`, and fails **open** after
  a 3 s `getUser()` timeout — so real authorization must stay in pages/actions + RLS.
  Run `scripts/test-auth-rls.mjs` after touching it.

## Optimistic UI pattern (builder, etc.)
`setState` immediately → `persist(() => serverAction())` → on failure `toast.error` +
`router.refresh()`. `persist` returns the promise so callers can `await` before
confirming (e.g. success toast only after the write resolves). Guard resync effects with
a pending-writes counter so a foreign `router.refresh()` can't drop in-flight edits.

## Backend guardrails (already in place — keep them)
- User-supplied fetches → `safeFetch` (`src/lib/ssrf.ts`), never raw `fetch`.
- `sanitizeSkinCss` allows `url(data:image/…)` only — no external URLs (end-customer
  IP-leak / Schweigepflicht). Colors from users: hex only.
- Private images: `signedImageUrl` (`lib/upload.ts`). Published/public: `publicImageUrl`
  (`lib/public-image.ts`, public bucket). Storage paths only `[A-Za-z0-9._/-]`
  (`lib/storage-path.ts`, DB-enforced since 0047).
- Publishing always via `publishTutorial()` (copies to public bucket, burns in blurs).
- Open-redirect: `safeNext` (`lib/url.ts`). Invites are single-use (`status === "pending"`).

## Migrations
Numbered SQL in `tutax/supabase/migrations/00NN_*.sql` (currently up to **0048**) — bump
the number. A fresh DB gets all of them via
`node --env-file=.env.local scripts/apply-migrations.mjs`; on the live DB a single new file
is applied inline (`pg` + `SUPABASE_DB_URL`) — by Richard, not by wave agents. Code that
reads/writes new columns may only reach `main` after the migration is live.

## Verify before done (root AGENTS.md is binding)
`npm run build` green (typecheck) + the relevant `scripts/test-<area>-live.mjs`. No
green → don't commit. App auto-deploys on `main` (Vercel, region `dub1`): push `main`
first, wait for a successful build, then `staging`. The Hetzner video-worker updates only
via human-run `deploy.sh`.

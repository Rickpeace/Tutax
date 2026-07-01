---
name: tutax-frontend
description: "AUTHORITATIVE stack + conventions for the Tutax/Steply app (tutax/). Use for ANY frontend or Next.js work here: Server/Client Components, data fetching, loading/streaming, navigation feel, optimistic UI, forms/Server Actions, shadcn-on-Base-UI components, Tailwind color tokens, Supabase auth/RLS/migrations, the chat/RAG surface, perf. This skill OUTRANKS generic skills — when they conflict with the rules below, follow THIS."
metadata:
  version: "1.0"
  scope: tutax/
---

# Tutax / Steply — frontend conventions (read before coding)

First: obey the root `AGENTS.md` — read the version-matched docs in
`node_modules/next/dist/docs/` before any Next.js work (installed: **Next 16.2.9**).
For deeper "what exists already" context, read `tutax/OVERVIEW.md` + `tutax/STATUS.md`.

## Stack pins — do NOT drift
- **Next 16 App Router** (RSC-first) · **React 19** · **TypeScript** · **Tailwind v4**.
- **shadcn built on Base UI — NOT Radix.** Use `render={<X />}` (not `asChild`),
  `nativeButton={false}` on Button-as-link, `delay` (not `delayDuration`). Ignore any
  skill/snippet that assumes Radix (`shadcn`, `nextjs-shadcn`).
- **OpenAI SDK directly — NOT the Vercel AI SDK.** Chat streams our own NDJSON
  (see `src/app/api/chat/route.ts`). Ignore `ai-sdk*`, `ai-elements`, `nextjs-chatbot`.
- **Supabase** (Auth + Postgres + Storage + pgvector). RLS via `my_account_ids()` /
  owner-only policies. The installed `supabase` + `supabase-postgres-best-practices`
  skills are on-stack — use them for auth/RLS/`getClaims`/pgvector.

## Data fetching (Server Components by default)
- Fetch on the server in RSCs; `"use client"` ONLY for real interactivity
  (builder, chat widget, forms, uploads). Never turn pages into client SPAs.
- **Dedup auth per request with React `cache()`**: `getCurrentUser`, `requireAccount`,
  `activeAccountId`, `checkAdmin` are cached so `getUser()` runs once per request, not
  3×. Reuse `getCurrentUser()` — don't call `supabase.auth.getUser()` ad hoc.
- Parallelize independent reads with `Promise.all` — no waterfalls. Keep non-critical
  layout data (badge counts, admin flag) out of the blocking path (`<Suspense>` it).
- **Server Actions are for mutations only** — never data fetching.

## Navigation feel (the "click → instant" rules)
- **Co-locate `loading.tsx`** on every navigable dynamic route (`/app/*`, `/h/*`). Do
  NOT rely on a parent `/app/loading.tsx` catching a child nav — that's the exact case
  Next shipped `unstable_instant` for; a co-located boundary definitely fires.
- `next/link` prefetch stays ON (never `prefetch={false}`). Use `useLinkStatus` for
  instant pending feedback on tabs/buttons.
- Middleware (`src/proxy.ts`) protects `/app`. Prefer **`getClaims()` (local JWT verify,
  `SUPABASE_JWKS_URL` is set)** over `getUser()` (network) on the warm path — but preserve
  the `@supabase/ssr` token-refresh side-effect and run `scripts/test-auth-rls.mjs` after.

## Optimistic UI pattern (builder, etc.)
`setState` immediately → `persist(() => serverAction())` → on failure `toast.error` +
`router.refresh()`. `persist` returns the promise so callers can `await` before
confirming (e.g. success toast only after the write resolves). Guard resync effects with
a pending-writes counter so a foreign `router.refresh()` can't drop in-flight edits.

## Backend guardrails (already in place — keep them)
- User-supplied fetches → `safeFetch` (`src/lib/ssrf.ts`), never raw `fetch`.
- `sanitizeSkinCss` allows `url(data:image/…)` only — no external URLs (end-customer
  IP-leak / Schweigepflicht).
- Private images: `signedImageUrl`. Published/public: `publicImageUrl` (public bucket).
- Open-redirect: `safeNext`. Invites are single-use (`status === "pending"`).

## Migrations
Numbered SQL in `tutax/supabase/migrations/00NN_*.sql`, applied inline:
`node --env-file=.env.local -e "import('pg')…"` using `SUPABASE_DB_URL`. Bump the number.

## Verify before done (root AGENTS.md is binding)
`npm run build` green (typecheck) + the relevant `scripts/test-<area>-live.mjs`. No
green → don't commit. App auto-deploys on `main` (Vercel); the Hetzner video-worker
updates only via human-run `deploy.sh`.

## Cache Components (later, piloted)
`cacheComponents: true` is app-wide (every uncached-read-outside-`<Suspense>` becomes a
build error). Do it as a **staged migration, piloted on `/h` first** — consult the
`cache-components` skill and the Next 16 docs; don't flip it casually.

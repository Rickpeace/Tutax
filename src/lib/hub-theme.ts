import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { hubTag } from "@/lib/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Schlanker, gecachter Theme-Load fürs /h-Layout: NUR was der persistente
 * Brand-Wrapper braucht (Tokens + Modus). Gleicher Tag wie der Seiten-Load
 * (hubTag) -> Theme-Änderungen invalidieren beides gemeinsam; cacheLife('hours')
 * als Fangnetz. Bewusst getrennt vom großen load() der Seiten: das Layout soll
 * nicht am Katalog hängen.
 */
export async function loadHubTheme(accountSlug: string) {
  "use cache";
  cacheTag(hubTag(accountSlug));
  cacheLife("hours");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("slug", accountSlug)
    .single();
  if (!account) return null;

  const { data: theme } = await admin
    .from("themes")
    .select(
      "tokens, ai_tokens, logo_path, ai_logo_path, mode, extreme_tokens, extreme_css, extreme_layout, extreme_logo_path",
    )
    .eq("account_id", account.id)
    .single();

  return { theme };
}

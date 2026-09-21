import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/account";
import { helpPageHref } from "@/components/app/nav-config";

/**
 * Stabile Adresse „meine Hilfe-Seite“ (/app/hilfe-seite → /h/<account_slug>).
 * Für Stellen, die den Konto-Slug nicht kennen (z. B. die ⌘K-Palette im statischen
 * App-Gerüst). requireAccount leitet ohne Login nach /login um.
 */
export async function GET() {
  const { account } = await requireAccount();
  redirect(helpPageHref(account.slug));
}

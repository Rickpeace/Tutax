// Test-Helfer: Erweiterungs-Verbindung (Recorder-Token) für ein Konto setzen.
// Seit Migration 0037 gilt der Token PRO PERSON (recorder_tokens) statt pro Konto
// (accounts.recorder_token) — die Tests hängen ihn an den (ersten) Inhaber des Kontos.
// Seit Migration 0041 darf eine Person mehrere Verbindungen haben (eine je Browser) -> wir
// fügen eine NEUE Zeile hinzu; vorhandene bleiben. Vor 0041 (Unique je Person) ersetzt der
// Fallback die eine Verbindung wie bisher.
export async function setRecorderToken(admin, accountId, token) {
  const { data: m } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("role", "owner")
    .limit(1);
  const userId = m?.[0]?.user_id;
  if (!userId) return { error: new Error("Konto ohne Inhaber") };
  const row = { token, account_id: accountId, user_id: userId, created_at: new Date().toISOString() };
  const ins = await admin.from("recorder_tokens").insert(row);
  if (ins.error?.code !== "23505") return ins;
  return admin.from("recorder_tokens").upsert(row, { onConflict: "account_id,user_id" });
}

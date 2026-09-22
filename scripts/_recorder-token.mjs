// Test-Helfer: Erweiterungs-Verbindung (Recorder-Token) für ein Konto setzen.
// Seit Migration 0037 gilt der Token PRO PERSON (recorder_tokens) statt pro Konto
// (accounts.recorder_token) — die Tests hängen ihn an den (ersten) Inhaber des Kontos.
export async function setRecorderToken(admin, accountId, token) {
  const { data: m } = await admin
    .from("account_members")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("role", "owner")
    .limit(1);
  const userId = m?.[0]?.user_id;
  if (!userId) return { error: new Error("Konto ohne Inhaber") };
  return admin
    .from("recorder_tokens")
    .upsert(
      { token, account_id: accountId, user_id: userId, created_at: new Date().toISOString() },
      { onConflict: "account_id,user_id" },
    );
}

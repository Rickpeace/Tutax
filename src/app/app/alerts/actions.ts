"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateAlertStatus(
  alertId: string,
  status: "acknowledged" | "resolved" | "dismissed",
) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "resolved" || status === "dismissed") {
    patch.resolved_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("change_alerts")
    .update(patch)
    .eq("id", alertId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/alerts");
}

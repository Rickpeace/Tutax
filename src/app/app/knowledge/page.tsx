import { redirect } from "next/navigation";

// Umgezogen unter den Tab „Assistent". Alter Deep-Link bleibt als Redirect erhalten.
export default function KnowledgeRedirect() {
  redirect("/app/assistent/wissen");
}

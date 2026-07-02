import { redirect } from "next/navigation";

// Umgezogen unter den Tab „Assistent". Alter Deep-Link bleibt als Redirect erhalten.
export default function EskalationRedirect() {
  redirect("/app/assistent/eskalation");
}

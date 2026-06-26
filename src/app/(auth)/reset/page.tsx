import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata: Metadata = { title: "Passwort zurücksetzen" };

export default function ResetPage() {
  return <ResetForm />;
}

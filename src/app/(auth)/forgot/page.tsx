import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function ForgotPage() {
  return <ForgotForm />;
}

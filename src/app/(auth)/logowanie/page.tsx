import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/app/(auth)/auth-card";
import { LoginForms } from "./login-forms";

export const metadata: Metadata = { title: "Logowanie" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Witaj z powrotem"
      footer={
        <>
          Nie masz konta?{" "}
          <Link href="/rejestracja" className="font-semibold text-accent underline underline-offset-4">
            Załóż je za darmo
          </Link>
        </>
      }
    >
      {/* Formularz czyta parametry z adresu (?next=…), więc renderuje się w przeglądarce. */}
      <Suspense fallback={<div className="h-96" aria-hidden="true" />}>
        <LoginForms />
      </Suspense>
    </AuthCard>
  );
}

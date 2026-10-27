import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/app/(auth)/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Załóż konto" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Załóż konto"
      intro="Drzewo bez limitu osób – za darmo. Twoje drzewo jest prywatne, dopóki go nie udostępnisz."
      footer={
        <>
          Masz już konto?{" "}
          <Link href="/logowanie" className="font-semibold text-accent underline underline-offset-4">
            Zaloguj się
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}

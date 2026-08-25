"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveUserDestination } from "@/lib/auth/destination";
import {
  hasSignupValidationErrors,
  isExistingSignupIdentity,
  signupErrorMessage,
  validateSignupForm,
  type SignupField,
  type SignupValues,
} from "@/lib/auth/signup";
import { createClient } from "@/lib/supabase/server";

export type SignupState = {
  status: "idle" | "error" | "confirmation_required";
  message: string | null;
  fieldErrors: Partial<Record<SignupField, string>>;
  values: SignupValues;
  emailAlreadyExists: boolean;
  attempt: number;
};

function confirmationRedirectUrl(origin: string | null) {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.pathname = "/auth/callback";
    url.search = "?next=/onboarding";
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function signup(previousState: SignupState, formData: FormData): Promise<SignupState> {
  const validation = validateSignupForm(formData);
  const attempt = previousState.attempt + 1;

  if (hasSignupValidationErrors(validation)) {
    return {
      status: "error",
      message: "Revise os campos destacados para continuar.",
      fieldErrors: validation.fieldErrors,
      values: validation.values,
      emailAlreadyExists: false,
      attempt,
    };
  }

  const requestHeaders = await headers();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: validation.values.email,
    password: validation.password,
    options: {
      data: { name: validation.values.name },
      emailRedirectTo: confirmationRedirectUrl(requestHeaders.get("origin")),
    },
  });

  if (error) {
    const friendlyError = signupErrorMessage(error);
    return {
      status: "error",
      message: friendlyError.message,
      fieldErrors: friendlyError.emailAlreadyExists ? { email: friendlyError.message } : {},
      values: validation.values,
      emailAlreadyExists: friendlyError.emailAlreadyExists,
      attempt,
    };
  }

  if (isExistingSignupIdentity(data.user)) {
    return {
      status: "error",
      message: "Já existe uma conta com este e-mail.",
      fieldErrors: { email: "Já existe uma conta com este e-mail." },
      values: validation.values,
      emailAlreadyExists: true,
      attempt,
    };
  }

  if (!data.user) {
    return {
      status: "error",
      message: "Não foi possível criar sua conta agora. Tente novamente.",
      fieldErrors: {},
      values: validation.values,
      emailAlreadyExists: false,
      attempt,
    };
  }

  if (!data.session) {
    return {
      status: "confirmation_required",
      message: "Confira seu e-mail para confirmar sua conta.",
      fieldErrors: {},
      values: validation.values,
      emailAlreadyExists: false,
      attempt,
    };
  }

  redirect(await resolveUserDestination(data.user.id));
}

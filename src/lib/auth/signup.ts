export type SignupField = "name" | "email" | "password" | "confirmPassword";

export type SignupValues = {
  name: string;
  email: string;
};

export type SignupValidation = {
  values: SignupValues;
  password: string;
  fieldErrors: Partial<Record<SignupField, string>>;
};

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignupForm(formData: FormData): SignupValidation {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  };
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fieldErrors: SignupValidation["fieldErrors"] = {};

  if (values.name.length < 2) fieldErrors.name = "Informe seu nome.";
  if (!emailPattern.test(values.email)) fieldErrors.email = "Informe um e-mail válido.";
  if (password.length < 8) fieldErrors.password = "Use uma senha com pelo menos 8 caracteres.";
  if (!confirmPassword) fieldErrors.confirmPassword = "Confirme sua senha.";
  else if (password !== confirmPassword) fieldErrors.confirmPassword = "As senhas não coincidem.";

  return { values, password, fieldErrors };
}

export function signupErrorMessage(error: AuthErrorLike): { message: string; emailAlreadyExists: boolean } {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  const emailAlreadyExists = code === "user_already_exists"
    || message.includes("already registered")
    || message.includes("already exists")
    || message.includes("user already");

  if (emailAlreadyExists) {
    return { message: "Já existe uma conta com este e-mail.", emailAlreadyExists: true };
  }
  if (code === "weak_password" || message.includes("password")) {
    return { message: "A senha não atende aos requisitos de segurança. Use pelo menos 8 caracteres.", emailAlreadyExists: false };
  }
  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return { message: "Informe um e-mail válido.", emailAlreadyExists: false };
  }
  if (error.status === 429 || code.includes("rate_limit")) {
    return { message: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.", emailAlreadyExists: false };
  }
  if (code === "signup_disabled") {
    return { message: "Novos cadastros estão temporariamente indisponíveis. Tente novamente mais tarde.", emailAlreadyExists: false };
  }
  return { message: "Não foi possível criar sua conta agora. Tente novamente.", emailAlreadyExists: false };
}

export function hasSignupValidationErrors(validation: SignupValidation) {
  return Object.keys(validation.fieldErrors).length > 0;
}

export function isExistingSignupIdentity(user: { identities?: unknown[] | null } | null) {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}

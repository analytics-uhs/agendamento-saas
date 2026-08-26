import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSignupValidationErrors,
  isExistingSignupIdentity,
  signupErrorMessage,
  validateSignupForm,
} from "./auth/signup";

function signupForm(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

test("valida os campos obrigatórios do cadastro", () => {
  const result = validateSignupForm(signupForm({}));
  assert.equal(hasSignupValidationErrors(result), true);
  assert.deepEqual(result.fieldErrors, {
    name: "Informe seu nome.",
    email: "Informe um e-mail válido.",
    password: "Use uma senha com pelo menos 8 caracteres.",
    confirmPassword: "Confirme sua senha.",
  });
});

test("normaliza nome e e-mail e aceita um cadastro válido", () => {
  const result = validateSignupForm(signupForm({
    name: "  Ulisses Herrmann  ",
    email: "  ULISSES@EXEMPLO.COM  ",
    password: "senha-segura",
    confirmPassword: "senha-segura",
  }));
  assert.equal(hasSignupValidationErrors(result), false);
  assert.deepEqual(result.values, { name: "Ulisses Herrmann", email: "ulisses@exemplo.com" });
  assert.equal(result.password, "senha-segura");
});

test("rejeita e-mail inválido e senhas divergentes", () => {
  const result = validateSignupForm(signupForm({
    name: "Ulisses",
    email: "email-invalido",
    password: "senha-segura",
    confirmPassword: "outra-senha",
  }));
  assert.equal(result.fieldErrors.email, "Informe um e-mail válido.");
  assert.equal(result.fieldErrors.confirmPassword, "As senhas não coincidem.");
});

test("traduz erros de conta existente sem expor mensagem técnica", () => {
  assert.deepEqual(signupErrorMessage({ code: "user_already_exists", message: "User already registered" }), {
    message: "Já existe uma conta com este e-mail.",
    emailAlreadyExists: true,
  });
  assert.equal(isExistingSignupIdentity({ identities: [] }), true);
  assert.equal(isExistingSignupIdentity({ identities: [{ id: "identity" }] }), false);
});

test("traduz rate limit e falhas desconhecidas em mensagens amigáveis", () => {
  assert.match(signupErrorMessage({ status: 429 }).message, /Aguarde alguns minutos/);
  assert.equal(signupErrorMessage({ message: "Internal error" }).message, "Não foi possível criar sua conta agora. Tente novamente.");
});

export type LoginInput = {
  email: string;
  password: string;
};

export type LoginFailureCode =
  | "invalid_credentials"
  | "missing_tenant"
  | "inactive_tenant"
  | "inactive_user"
  | "web_access_denied";

export function buildLoginPayload(input: LoginInput): LoginInput {
  return {
    email: input.email.trim(),
    password: input.password,
  };
}

export function isValidLoginInput(input: LoginInput): boolean {
  return input.email.trim().length > 0 && input.password.length > 0;
}

export function getLoginFailureMessage(code: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Revisá el email y la contraseña.";
    case "missing_tenant":
      return "No encontramos una empresa asociada a este usuario.";
    case "inactive_tenant":
      return "La cuenta de la empresa está inactiva.";
    case "inactive_user":
      return "Tu usuario está inactivo.";
    case "web_access_denied":
      return "Tu usuario no tiene acceso al portal web.";
    default:
      return "No pudimos autenticarte en este momento. Inténtalo nuevamente.";
  }
}

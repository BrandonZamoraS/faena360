import { describe, expect, it } from "vitest";
import {
  buildLoginPayload,
  getLoginFailureMessage,
  isValidLoginInput,
} from "./login-model";

describe("login UI model", () => {
  it("trims email before sending credentials", () => {
    expect(
      buildLoginPayload({ email: " admin@faena360.com ", password: "secret" })
    ).toEqual({ email: "admin@faena360.com", password: "secret" });
  });

  it("requires both email and password before submitting", () => {
    expect(
      isValidLoginInput({ email: "admin@faena360.com", password: "" })
    ).toBe(false);
    expect(isValidLoginInput({ email: "", password: "secret" })).toBe(false);
    expect(
      isValidLoginInput({ email: "admin@faena360.com", password: "secret" })
    ).toBe(true);
  });

  it("maps backend auth failures to user-facing messages", () => {
    expect(getLoginFailureMessage("invalid_credentials")).toBe(
      "Revisá el email y la contraseña."
    );
    expect(getLoginFailureMessage("missing_tenant")).toBe(
      "No encontramos una empresa asociada a este usuario."
    );
    expect(getLoginFailureMessage("inactive_tenant")).toBe(
      "La cuenta de la empresa está inactiva."
    );
    expect(getLoginFailureMessage("inactive_user")).toBe(
      "Tu usuario está inactivo."
    );
    expect(getLoginFailureMessage("web_access_denied")).toBe(
      "Tu usuario no tiene acceso al portal web."
    );
  });

  it("returns fallback for unknown auth failure codes", () => {
    expect(getLoginFailureMessage("tenant_locked")).toBe(
      "No pudimos autenticarte en este momento. Inténtalo nuevamente."
    );
  });
});

"use client";

import { useState } from "react";
import {
  buildLoginPayload,
  getLoginFailureMessage,
  isValidLoginInput,
  type LoginFailureCode,
} from "./login-model";

type LoginResponse =
  | { ok: true; session: { email: string; tenant_id: string; roles: string[] } }
  | { ok: false; code: LoginFailureCode };

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(event.currentTarget);
    const nextEmail =
      typeof formData.get("email") === "string"
        ? (formData.get("email") as string)
        : email;
    const nextPassword =
      typeof formData.get("password") === "string"
        ? (formData.get("password") as string)
        : password;
    setEmail(nextEmail);
    setPassword(nextPassword);

    const credentials = buildLoginPayload({
      email: nextEmail,
      password: nextPassword,
    });
    if (!isValidLoginInput(credentials)) {
      setError("Ingresá email y contraseña para continuar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const payload = (await response.json()) as LoginResponse;

      if (!response.ok || !payload.ok) {
        const code = payload.ok ? "invalid_credentials" : payload.code;
        setError(getLoginFailureMessage(code));
        return;
      }

      setSuccess(`Sesión iniciada como ${payload.session.email}.`);
    } catch {
      setError("No pudimos iniciar sesión. Intentá nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <p className="text-sm font-medium text-[#0f5132]">Portal operativo</p>
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[#102118] sm:text-5xl">
          Iniciar sesión en Faena360
        </h1>
        <p className="max-w-prose text-base leading-7 text-[#385346]">
          Accedé al tablero web para operar con usuarios habilitados y empresas
          activas.
        </p>
      </div>

      <div className="space-y-5">
        <label className="block space-y-2" htmlFor="email">
          <span className="text-sm font-medium text-[#24382e]">Email</span>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="login-input"
            placeholder="admin@faena360.com"
          />
        </label>

        <label className="block space-y-2" htmlFor="password">
          <span className="text-sm font-medium text-[#24382e]">Contraseña</span>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="login-input"
            placeholder="Ingresá tu contraseña"
          />
        </label>
      </div>

      <div
        className="login-feedback-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-login-feedback-region
      >
        {error ? (
          <p className="login-alert login-alert-error">{error}</p>
        ) : null}
        {success ? (
          <p className="login-alert login-alert-success">{success}</p>
        ) : null}
      </div>

      <button className="login-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Iniciando sesión..." : "Iniciar sesión"}
      </button>
    </form>
  );
}

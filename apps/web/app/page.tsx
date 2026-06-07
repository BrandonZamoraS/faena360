import { LoginForm } from "./login-form";
import { LoginVisual } from "../components/login-visual";

export default function Home() {
  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="Inicio de sesión">
        <div className="login-panel">
          <LoginVisual />
          <div className="space-y-6">
            <p className="text-sm font-medium text-[#d7f5df]">Faena360</p>
            <p className="max-w-xl text-3xl leading-tight font-semibold tracking-[-0.03em] text-white sm:text-5xl">
              Gestión operativa para equipos que necesitan entrar y resolver.
            </p>
            <p className="max-w-prose text-base leading-7 text-[#b7d9c2]">
              El acceso web queda reservado para administradores y supervisores
              con permisos activos.
            </p>
          </div>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}

/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";
import Layout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
  Geist: vi.fn(() => ({ variable: "--font-geist-sans" })),
  Geist_Mono: vi.fn(() => ({ variable: "--font-geist-mono" })),
}));

describe("Login entry page", () => {
  it("renders root login UI with labeled form controls and submit button", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('class="login-shell"');
    expect(html).toContain('for="email"');
    expect(html).toContain("Email");
    expect(html).toContain("Contraseña");
    expect(html).toContain('type="submit"');
    expect(html).toContain("Iniciar sesión");
  });

  it("does not render protected route links from the login entry", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).not.toContain("/dashboard");
    expect(html).not.toContain("/protected");
  });
});

describe("root layout metadata", () => {
  it("keeps Spanish metadata and document language", () => {
    expect(metadata.title).toContain("Inicio de sesión");
    expect(metadata.description).toContain("usuarios habilitados");

    const html = renderToStaticMarkup(
      <Layout>
        <div>Login app</div>
      </Layout>
    );

    expect(html).toContain('lang="es"');
  });
});

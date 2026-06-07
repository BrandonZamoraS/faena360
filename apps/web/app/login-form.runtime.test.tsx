/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { LoginForm } from "./login-form";

type BrowserFetch = NonNullable<typeof fetch>;

describe("LoginForm runtime behavior", () => {
  let root: ReturnType<typeof createRoot> | null = null;
  let container: HTMLDivElement | null = null;
  let originalFetch: BrowserFetch | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (root) {
      root.unmount();
      root = null;
    }

    container?.remove();
    container = null;
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    vi.restoreAllMocks();
  });

  async function mountForm() {
    if (!root) {
      throw new Error("Root not available");
    }

    root.render(<LoginForm />);

    for (let i = 0; i < 5; i += 1) {
      await flushToNextTick();
      const form = container?.querySelector("form.login-card");
      if (form) {
        break;
      }
    }

    const form = container?.querySelector<HTMLFormElement>("form.login-card");
    if (!form) {
      throw new Error("LoginForm form not found");
    }

    const emailInput = form.querySelector<HTMLInputElement>("#email");
    const passwordInput = form.querySelector<HTMLInputElement>("#password");
    const submitButton = form.querySelector<HTMLButtonElement>(
      "button[type='submit']"
    );
    const feedbackRegion = form.querySelector<HTMLElement>(
      "[data-login-feedback-region]"
    );
    const emailLabel = form.querySelector<HTMLLabelElement>("label[for='email']");
    const passwordLabel = form.querySelector<HTMLLabelElement>(
      "label[for='password']"
    );

    if (
      !emailInput ||
      !passwordInput ||
      !submitButton ||
      !feedbackRegion ||
      !emailLabel ||
      !passwordLabel
    ) {
      throw new Error("LoginForm markup is incomplete");
    }

    return {
      form,
      emailInput,
      passwordInput,
      submitButton,
      feedbackRegion,
      emailLabel,
      passwordLabel,
    };
  }

  function getFormParts() {
    const form = container?.querySelector<HTMLFormElement>("form.login-card");
    if (!form) {
      throw new Error("LoginForm form not found");
    }

    const emailInput = form.querySelector<HTMLInputElement>("#email");
    const passwordInput = form.querySelector<HTMLInputElement>("#password");
    const submitButton = form.querySelector<HTMLButtonElement>(
      "button[type='submit']"
    );
    const feedbackRegion = form.querySelector<HTMLElement>(
      "[data-login-feedback-region]"
    );
    const emailLabel = form.querySelector<HTMLLabelElement>("label[for='email']");
    const passwordLabel = form.querySelector<HTMLLabelElement>(
      "label[for='password']"
    );

    if (
      !emailInput ||
      !passwordInput ||
      !submitButton ||
      !feedbackRegion ||
      !emailLabel ||
      !passwordLabel
    ) {
      throw new Error("LoginForm markup is incomplete");
    }

    return {
      form,
      emailInput,
      passwordInput,
      submitButton,
      feedbackRegion,
      emailLabel,
      passwordLabel,
    };
  }

  async function submitForm() {
    const { form } = getFormParts();
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(
        new Event("submit", {
          bubbles: true,
          cancelable: true,
        })
      );
    }
    await flushToNextTick();
    await flushToNextTick();
  }

  function flushToNextTick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function mountAndGetParts() {
    return await mountForm();
  }


  it("renders labeled controls and submit action", async () => {
    const { emailLabel, passwordLabel, submitButton, feedbackRegion } =
      await mountAndGetParts();

    expect(emailLabel.textContent).toContain("Email");
    expect(passwordLabel.textContent).toContain("Contraseña");
    expect(submitButton.type).toBe("submit");
    expect(submitButton.textContent).toContain("Iniciar sesión");
    expect(feedbackRegion.getAttribute("data-login-feedback-region")).toBe("true");
    expect(feedbackRegion.classList.contains("login-feedback-region")).toBe(true);
  });

  it("blocks empty submit on client and shows inline validation", async () => {
    const { feedbackRegion } = await mountAndGetParts();
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await submitForm();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(feedbackRegion.textContent).toBe("Ingresá email y contraseña para continuar.");
    expect(feedbackRegion.getAttribute("role")).toBe("status");
    expect(feedbackRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("posts trimmed email and unchanged password to the login API", async () => {
    const { emailInput, passwordInput, feedbackRegion } =
      await mountAndGetParts();
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          session: {
            email: "admin@faena360.com",
            tenant_id: "tenant-id",
            roles: ["admin"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    emailInput.value = "  admin@faena360.com  ";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailInput.dispatchEvent(new Event("change", { bubbles: true }));
    passwordInput.value = "P@ssw0rd!";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
    await flushToNextTick();

    await submitForm();

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall?.[0]).toBe("/api/auth/login");

    const bodyText = fetchCall?.[1]?.body;
    expect(typeof bodyText).toBe("string");
    const body = JSON.parse(bodyText as string);
    expect(body).toEqual({
      email: "admin@faena360.com",
      password: "P@ssw0rd!",
    });

    expect(feedbackRegion.textContent).toContain(
      "Sesión iniciada como admin@faena360.com."
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(window.location.href).toContain("http://localhost");
  });

  it("replaces prior success feedback when a later failure arrives", async () => {
    const { emailInput, passwordInput, feedbackRegion } =
      await mountAndGetParts();

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            session: {
              email: "admin@faena360.com",
              tenant_id: "tenant-id",
              roles: ["admin"],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            code: "missing_tenant",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );

    emailInput.value = "admin@faena360.com";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailInput.dispatchEvent(new Event("change", { bubbles: true }));
    passwordInput.value = "password";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
    await flushToNextTick();

    await submitForm();
    expect(feedbackRegion.textContent).toContain(
      "Sesión iniciada como admin@faena360.com."
    );

    await submitForm();
    expect(feedbackRegion.textContent).toBe(
      "No encontramos una empresa asociada a este usuario."
    );
  });
});

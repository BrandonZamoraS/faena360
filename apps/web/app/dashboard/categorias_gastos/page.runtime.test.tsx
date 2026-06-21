import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ExpenseCategoriesPage, {
  createExpenseCategoryAction,
  canAccessExpenseCategoryCatalogPage,
  canRunExpenseCategoryCatalogAction,
  hideExpenseCategoryAction,
  renderExpenseCategoryCatalogShell,
  updateExpenseCategoryAction,
} from "./page";

const redirectMock = vi.hoisted(() => vi.fn<(path: string) => void>());
const requireWebAccessMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());
const createWebSupabaseServiceClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

function createQueryBuilder() {
  const queryBuilder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { name: "Tenant A" },
      error: null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
  };

  return queryBuilder;
}

const defaultRpcSuccess = { data: true, error: null };

vi.mock("../../../lib/auth/session", () => ({
  createServerStateSessionRefresher: vi.fn(),
  requireWebAccess: (...args: unknown[]) => requireWebAccessMock(...args),
}));

vi.mock("next/headers", () => ({
  cookies: (...args: unknown[]) => cookiesMock(...args),
}));

vi.mock("../../../lib/supabase", () => ({
  createWebSupabaseServiceClient: (...args: unknown[]) =>
    createWebSupabaseServiceClientMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectMock(path);
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as { digest?: string }).digest = "NEXT_REDIRECT";
    throw error;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

const baselineSession = {
  user_id: "user-no-create",
  auth_user_id: "auth-user-no-create",
  tenant_id: "tenant-a",
  email: "user@faena360.com",
  roles: ["admin"],
  effective_capabilities: ["categories:read"],
  status: "active",
  can_access_web: true,
};

const adminSession = {
  ...baselineSession,
  effective_capabilities: [
    "categories:read",
    "categories:create",
    "categories:update",
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  cookiesMock.mockResolvedValue("cookieStore");
  requireWebAccessMock.mockResolvedValue({
    ok: true,
    session: baselineSession,
  });
  createWebSupabaseServiceClientMock.mockReturnValue({
    from: vi.fn(() => createQueryBuilder()),
    rpc: vi.fn().mockResolvedValue(defaultRpcSuccess),
  });
});

describe("categorias_gastos page shell", () => {
  it("renders create, edit, and hide controls for authorized users", () => {
    const html = renderToStaticMarkup(
      renderExpenseCategoryCatalogShell({
        tenantName: "Tenant A",
        capabilities: [
          "categories:read",
          "categories:create",
          "categories:update",
        ],
        categories: [
          {
            id: "cat-1",
            nombre: "Combustible",
            descripcion: "Gastos de gasoil",
          },
        ],
      })
    );

    expect(html).toContain("Categorías de gastos");
    expect(html).toContain("Crear categoría");
    expect(html).toContain("Combustible");
    expect(html).toContain("Gastos de gasoil");
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Ocultar categoría");
  });

  it("shows read-only shell without mutation controls", () => {
    const html = renderToStaticMarkup(
      renderExpenseCategoryCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["categories:read"],
        categories: [],
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain("Crear categoría");
    expect(html).not.toContain("Guardar cambios");
    expect(html).not.toContain("Ocultar categoría");
  });

  it("highlights the active expense category module in the sidebar", () => {
    const html = renderToStaticMarkup(
      renderExpenseCategoryCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["categories:read", "fuel_types:read", "clients:read"],
        categories: [],
      })
    );

    expect(html).toContain(
      'class="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white" href="/dashboard/categorias_gastos"'
    );
    expect(html).toContain(
      'class="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] transition hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2f7044]" href="/dashboard/tipos_combustible"'
    );
  });

  it("hides shell without categories read capability", () => {
    const html = renderToStaticMarkup(
      renderExpenseCategoryCatalogShell({
        tenantName: "Tenant A",
        capabilities: ["users:read"],
        categories: [],
      })
    );

    expect(html).toContain("Catálogo visible en modo lectura.");
    expect(html).not.toContain('href="/dashboard/categorias_gastos"');
  });

  it("requires read and action capabilities", () => {
    expect(canAccessExpenseCategoryCatalogPage(["categories:read"])).toBe(true);
    expect(canAccessExpenseCategoryCatalogPage(["categories:create"])).toBe(
      false
    );

    expect(
      canRunExpenseCategoryCatalogAction(
        ["categories:create"],
        "categories:create"
      )
    ).toBe(false);
    expect(
      canRunExpenseCategoryCatalogAction(
        ["categories:read", "categories:create"],
        "categories:create"
      )
    ).toBe(true);

    expect(
      canRunExpenseCategoryCatalogAction(
        ["categories:read", "categories:create"],
        "categories:update"
      )
    ).toBe(false);

    expect(
      canRunExpenseCategoryCatalogAction(
        ["categories:read", "categories:update"],
        "categories:update"
      )
    ).toBe(true);

    expect(
      canRunExpenseCategoryCatalogAction(
        ["categories:create", "categories:update"],
        "categories:update"
      )
    ).toBe(false);
  });
});

describe("categorias_gastos runtime server guards", () => {
  it("redirects page render when read capability is missing", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: {
        ...baselineSession,
        effective_capabilities: ["categories:create"],
      },
    });

    const fromMock = vi.fn(() => createQueryBuilder());
    createWebSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    await expect(ExpenseCategoriesPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("redirects create action when categories:create capability is missing", async () => {
    const formData = new FormData();
    formData.set("nombre", "Combustible");

    const fromMock = vi.fn(() => createQueryBuilder());
    createWebSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    await expect(createExpenseCategoryAction(formData)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("redirects update action when categories:update capability is missing", async () => {
    const formData = new FormData();
    formData.set("categoryId", "cat-1");
    formData.set("nombre", "Combustible");

    const fromMock = vi.fn(() => createQueryBuilder());
    createWebSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    await expect(updateExpenseCategoryAction(formData)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("redirects hide action when categories:update capability is missing", async () => {
    const formData = new FormData();
    formData.set("categoryId", "cat-1");

    const fromMock = vi.fn(() => createQueryBuilder());
    createWebSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    await expect(hideExpenseCategoryAction(formData)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("creates an expense category using tenant_id from session", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("nombre", "Combustible");
    formData.set("descripcion", "Gastos del turno");

    const rpcMock = vi
      .fn()
      .mockResolvedValue({ data: "d8eb0000-0000-0000-0000-000000000001", error: null });
    const queryBuilder = createQueryBuilder();
    const fromMock = vi.fn(() => queryBuilder);
    createWebSupabaseServiceClientMock.mockReturnValue({
      from: fromMock,
      rpc: rpcMock,
    });

    await createExpenseCategoryAction(formData);

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("create_categoria_gasto", {
      p_actor_id: "user-no-create",
      p_audit_source: "web",
      p_tenant_id: "tenant-a",
      p_nombre: "Combustible",
      p_descripcion: "Gastos del turno",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/categorias_gastos"
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects empty and whitespace category names on create", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("nombre", "   ");

    await expect(createExpenseCategoryAction(formData)).rejects.toThrow(
      "missing_name"
    );

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("maps duplicate active-name conflict to stable duplicate token on create", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("nombre", "Combustible");

    const rpcMock = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      });
    const queryBuilder = createQueryBuilder();
    const fromMock = vi.fn(() => queryBuilder);
    createWebSupabaseServiceClientMock.mockReturnValue({
      from: fromMock,
      rpc: rpcMock,
    });

    await expect(createExpenseCategoryAction(formData)).rejects.toThrow(
      "duplicate_active_name"
    );

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("create_categoria_gasto", {
      p_actor_id: "user-no-create",
      p_audit_source: "web",
      p_tenant_id: "tenant-a",
      p_nombre: "Combustible",
      p_descripcion: null,
    });
  });

  it("loads tenant-scoped active categories for page rendering", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const tenantQueryBuilder = createQueryBuilder();
    const categoriesQueryBuilder = createQueryBuilder();
    categoriesQueryBuilder.order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "cat-visible",
          nombre: "Combustible",
          descripcion: "Solo activo",
        },
      ],
      error: null,
    });

    const fromMock = vi
      .fn()
      .mockReturnValueOnce(tenantQueryBuilder)
      .mockReturnValueOnce(categoriesQueryBuilder);
    createWebSupabaseServiceClientMock.mockReturnValue({ from: fromMock });

    const html = renderToStaticMarkup(await ExpenseCategoriesPage());

    expect(fromMock).toHaveBeenNthCalledWith(1, "tenants");
    expect(fromMock).toHaveBeenNthCalledWith(2, "categorias_gastos");

    expect(categoriesQueryBuilder.select).toHaveBeenCalledWith(
      "id,nombre,descripcion"
    );
    expect(categoriesQueryBuilder.eq).toHaveBeenNthCalledWith(
      1,
      "tenant_id",
      "tenant-a"
    );
    expect(categoriesQueryBuilder.eq).toHaveBeenNthCalledWith(
      2,
      "estado",
      "activo"
    );

    expect(html).toContain("Tenant A");
    expect(html).toContain("Combustible");
    expect(html).toContain("Solo activo");
  });

  it("updates an expense category scoped to session tenant", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("categoryId", "cat-1");
    formData.set("nombre", "Combustible actualizado");
    formData.set("descripcion", "Actualizado");

    const rpcMock = vi
      .fn()
      .mockResolvedValue({
        data: true,
        error: null,
      });
    const queryBuilder = createQueryBuilder();
    const fromMock = vi.fn(() => queryBuilder);
    createWebSupabaseServiceClientMock.mockReturnValue({
      from: fromMock,
      rpc: rpcMock,
    });

    await updateExpenseCategoryAction(formData);

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("update_categoria_gasto", {
      p_actor_id: "user-no-create",
      p_audit_source: "web",
      p_tenant_id: "tenant-a",
      p_category_id: "cat-1",
      p_nombre: "Combustible actualizado",
      p_descripcion: "Actualizado",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/categorias_gastos"
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects empty and whitespace category names on update", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("categoryId", "cat-1");
    formData.set("nombre", "   ");

    await expect(updateExpenseCategoryAction(formData)).rejects.toThrow(
      "missing_name"
    );

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("maps duplicate active-name conflict to stable duplicate token on update", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("categoryId", "cat-1");
    formData.set("nombre", "Combustible repetido");

    const rpcMock = vi
      .fn()
      .mockResolvedValue({
        data: false,
        error: { code: "23505", message: "duplicate key value" },
      });
    const queryBuilder = createQueryBuilder();

    const fromMock = vi.fn(() => queryBuilder);
    createWebSupabaseServiceClientMock.mockReturnValue({
      from: fromMock,
      rpc: rpcMock,
    });

    await expect(updateExpenseCategoryAction(formData)).rejects.toThrow(
      "duplicate_active_name"
    );

    expect(rpcMock).toHaveBeenCalledWith("update_categoria_gasto", {
      p_actor_id: "user-no-create",
      p_audit_source: "web",
      p_tenant_id: "tenant-a",
      p_category_id: "cat-1",
      p_nombre: "Combustible repetido",
      p_descripcion: null,
    });
  });

  it("hides an expense category scoped to session tenant", async () => {
    requireWebAccessMock.mockResolvedValue({
      ok: true,
      session: adminSession,
    });

    const formData = new FormData();
    formData.set("categoryId", "cat-1");

    const rpcMock = vi
      .fn()
      .mockResolvedValue({
        data: true,
        error: null,
      });
    const queryBuilder = createQueryBuilder();
    const fromMock = vi.fn(() => queryBuilder);
    createWebSupabaseServiceClientMock.mockReturnValue({
      from: fromMock,
      rpc: rpcMock,
    });

    await hideExpenseCategoryAction(formData);

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("hide_categoria_gasto", {
      p_actor_id: "user-no-create",
      p_audit_source: "web",
      p_tenant_id: "tenant-a",
      p_category_id: "cat-1",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/dashboard/categorias_gastos"
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

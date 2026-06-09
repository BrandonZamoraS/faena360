import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { canAccessUserAdminPage, renderUserAdminShell } from "./page";

const roles = [
  { id: "role-admin", name: "administrador" },
  { id: "role-supervisor", name: "supervisor" },
];

describe("admin_usuarios page shell", () => {
  it("renders create, edit and soft delete controls for tenant users", () => {
    const html = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        roles,
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: "15551112222",
            status: "active",
          },
        ],
      })
    );

    expect(html).toContain("admin_usuarios");
    expect(html).toContain("Crear usuario");
    expect(html).toContain("Modificar usuario");
    expect(html).toContain("Eliminar usuario");
    expect(html).toContain("Soft delete: el perfil pasa a inactivo");
    expect(html).toContain("Cerrar sesión");
  });

  it("requires read plus at least one user administration capability", () => {
    expect(canAccessUserAdminPage(["users:read", "users:create"])).toBe(true);
    expect(canAccessUserAdminPage(["users:read", "users:update"])).toBe(true);
    expect(canAccessUserAdminPage(["users:create", "users:update"])).toBe(
      false
    );
    expect(canAccessUserAdminPage(["users:read"])).toBe(false);
  });
});

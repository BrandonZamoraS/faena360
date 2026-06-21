import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canAccessUserAdminPage,
  canRunUserAdminAction,
  renderUserAdminShell,
} from "./page";

const roles = [
  { id: "role-admin", name: "administrador" },
  { id: "role-supervisor", name: "supervisor" },
];

describe("admin_usuarios page shell", () => {
  it("renders create, edit and soft delete controls for tenant users", () => {
    const html = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: [
          "users:create",
          "users:update",
          "roles:read",
          "roles:update",
        ],
        roles,
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: "15551112222",
            status: "active",
            role_ids: ["role-admin"],
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

  it("hides controls that the session cannot execute", () => {
    const creatorHtml = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:create"],
        roles: [],
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: null,
            status: "active",
            role_ids: [],
          },
        ],
      })
    );

    expect(creatorHtml).toContain("Crear usuario");
    expect(creatorHtml).not.toContain("Modificar usuario");
    expect(creatorHtml).not.toContain("Eliminar usuario");
    expect(creatorHtml).not.toContain("administrador");

    const updaterHtml = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:update"],
        roles: [],
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: null,
            status: "active",
            role_ids: [],
          },
        ],
      })
    );

    expect(updaterHtml).not.toContain("Crear usuario");
    expect(updaterHtml).toContain("Modificar usuario");
    expect(updaterHtml).toContain("Eliminar usuario");
  });

  it("renders role controls only when role read and update capabilities are present", () => {
    const roleReaderHtml = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:create", "roles:read"],
        roles,
        users: [],
      })
    );

    expect(roleReaderHtml).not.toContain("administrador");

    const roleManagerHtml = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:create", "roles:read", "roles:update"],
        roles,
        users: [],
      })
    );

    expect(roleManagerHtml).toContain("administrador");
  });

  it("requires read plus at least one user administration capability", () => {
    expect(canAccessUserAdminPage(["users:read", "users:create"])).toBe(true);
    expect(canAccessUserAdminPage(["users:read", "users:update"])).toBe(true);
    expect(canAccessUserAdminPage(["users:create", "users:update"])).toBe(
      false
    );
    expect(canAccessUserAdminPage(["users:read"])).toBe(false);
  });

  it("requires the module gate before allowing server actions", () => {
    expect(canRunUserAdminAction(["users:create"], "users:create")).toBe(false);
    expect(
      canRunUserAdminAction(["users:read", "users:create"], "users:create")
    ).toBe(true);
    expect(
      canRunUserAdminAction(["users:read", "users:create"], "users:update")
    ).toBe(false);
  });

  it("renders role checkboxes in update form when canManageRoles is true", () => {
    const html = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:update", "roles:read", "roles:update"],
        roles,
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: "15551112222",
            status: "active",
            role_ids: ["role-admin"],
          },
        ],
      })
    );

    expect(html).toContain("administrador");
    expect(html).toContain("supervisor");
    expect(html).toContain("Guardar cambios");
    expect(html).toContain('checked="" value="role-admin"');
  });

  it("hides role checkboxes in update form when canManageRoles is false", () => {
    const html = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:update"],
        roles: [],
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: null,
            status: "active",
            role_ids: [],
          },
        ],
      })
    );

    expect(html).toContain("Guardar cambios");
    expect(html).not.toContain("administrador");
  });

  it("renders roleIdsPresent hidden field when role controls are shown so empty role selection is submitted", () => {
    const html = renderToStaticMarkup(
      renderUserAdminShell({
        tenantName: "Tenant A",
        capabilities: ["users:update", "roles:read", "roles:update"],
        roles,
        users: [
          {
            user_id: "user-1",
            tenant_id: "tenant-a",
            email: "user@example.com",
            full_name: "Tenant User",
            phone: null,
            status: "active",
            role_ids: [],
          },
        ],
      })
    );

    expect(html).toContain('name="roleIdsPresent"');
    expect(html).toContain("Guardar cambios");
  });
});

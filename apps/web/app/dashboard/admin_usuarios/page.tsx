import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AppSession, TenantUserSummary } from "@faena360/domain";
import { CapabilityDeniedError } from "@faena360/application";
import { createUserManagementService } from "@faena360/application";
import { InMemoryEffectiveCapabilitiesCache } from "@faena360/application";
import {
  SupabaseAppSessionRepository,
  SupabaseAuthAdminAdapter,
  SupabaseUserManagementRepository,
} from "@faena360/infrastructure";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import {
  APP_SESSION_COOKIE_NAME,
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";

type TenantRoleOption = {
  readonly id: string;
  readonly name: string;
};

type UserAdminShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly users: readonly TenantUserSummary[];
  readonly roles: readonly TenantRoleOption[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly deactivateAction?: (formData: FormData) => Promise<void>;
};

const USER_READ_CAPABILITY = "users:read";
const USER_CREATE_CAPABILITY = "users:create";
const USER_UPDATE_CAPABILITY = "users:update";
const ROLE_READ_CAPABILITY = "roles:read";
const ROLE_UPDATE_CAPABILITY = "roles:update";
const USER_ADMIN_CAPABILITIES = [
  USER_CREATE_CAPABILITY,
  USER_UPDATE_CAPABILITY,
];

export function renderUserAdminShell(input: UserAdminShellInput) {
  // La página puede abrirse con permisos delegados; cada bloque debe reflejar
  // la acción real que la sesión puede ejecutar para no mostrar formularios que
  // el servidor va a rechazar de todos modos.
  const canCreateUsers = input.capabilities.includes(USER_CREATE_CAPABILITY);
  const canUpdateUsers = input.capabilities.includes(USER_UPDATE_CAPABILITY);
  const canManageRoles = canRenderRoleControls(input.capabilities);

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="flex border-b border-[#dcebe1] bg-[#edf5ec] px-6 py-6 lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <p className="text-sm font-semibold text-[#173b29]">Faena360</p>
          <nav className="mt-8 space-y-2" aria-label="Módulos">
            <a
              className="block rounded-xl px-4 py-3 text-sm font-semibold text-[#173b29] hover:bg-white"
              href="/dashboard"
            >
              Dashboard
            </a>
            <a
              className="block rounded-xl bg-[#173b29] px-4 py-3 text-sm font-semibold text-white"
              href="/dashboard/admin_usuarios"
            >
              admin_usuarios
            </a>
          </nav>
          <form action={logoutAction} className="mt-8 lg:mt-auto">
            <button
              className="w-full rounded-xl border border-[#d0e2d6] bg-white px-4 py-3 text-left text-sm font-semibold text-[#173b29] transition hover:bg-[#f7faf5]"
              type="submit"
            >
              Cerrar sesión
            </button>
          </form>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              admin_usuarios
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Crear, modificar y eliminar usuarios del tenant autenticado. Soft
              delete: el perfil pasa a inactivo y deja de poder iniciar sesión.
            </p>
          </header>

          {canCreateUsers ? (
            <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
              <h2 className="text-xl font-semibold">Crear usuario</h2>
              <form
                action={input.createAction}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <label className="space-y-2 text-sm font-medium">
                  <span>Email</span>
                  <input
                    className="login-input"
                    name="email"
                    required
                    type="email"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>Contraseña temporal</span>
                  <input
                    className="login-input"
                    name="temporaryPassword"
                    required
                    type="password"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>Nombre completo</span>
                  <input
                    className="login-input"
                    name="fullName"
                    required
                    type="text"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>Teléfono</span>
                  <input className="login-input" name="phone" type="tel" />
                </label>
                {canManageRoles ? <RoleCheckboxes roles={input.roles} /> : null}
                <button className="login-button md:col-span-2" type="submit">
                  Crear usuario
                </button>
              </form>
            </section>
          ) : null}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Usuarios activos</h2>
            {input.users.map((user) => (
              <article
                className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                key={user.user_id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{user.full_name}</p>
                    <p className="text-sm text-[#385346]">{user.email}</p>
                  </div>
                  <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                    {user.status}
                  </p>
                </div>
                {canUpdateUsers ? (
                  <>
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]"
                    >
                      <input name="userId" type="hidden" value={user.user_id} />
                      <label className="space-y-2 text-sm font-medium">
                        <span>Modificar usuario</span>
                        <input
                          className="login-input"
                          name="fullName"
                          required
                          type="text"
                          defaultValue={user.full_name}
                        />
                      </label>
                      <label className="space-y-2 text-sm font-medium">
                        <span>Teléfono</span>
                        <input
                          className="login-input"
                          name="phone"
                          type="tel"
                          defaultValue={user.phone ?? ""}
                        />
                      </label>
                      {canManageRoles ? (
                        <RoleCheckboxes roles={input.roles} />
                      ) : null}
                      <button className="login-button self-end" type="submit">
                        Guardar cambios
                      </button>
                    </form>
                    <form action={input.deactivateAction} className="mt-4">
                      <input name="userId" type="hidden" value={user.user_id} />
                      <button
                        className="rounded-xl bg-[#fff1f0] px-4 py-3 text-sm font-semibold text-[#8a1f16]"
                        type="submit"
                      >
                        Eliminar usuario
                      </button>
                    </form>
                  </>
                ) : null}
              </article>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}

function RoleCheckboxes({
  roles,
}: {
  readonly roles: readonly TenantRoleOption[];
}) {
  return (
    <fieldset className="space-y-2 md:col-span-2">
      <legend className="text-sm font-semibold">Roles</legend>
      <input name="roleIdsPresent" type="hidden" value="1" />
      <div className="flex flex-wrap gap-3">
        {roles.map((role) => (
          <label
            className="rounded-full border border-[#dcebe1] px-3 py-2 text-sm"
            key={role.id}
          >
            <input
              className="mr-2"
              name="roleIds"
              type="checkbox"
              value={role.id}
            />
            {role.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(APP_SESSION_COOKIE_NAME);
  redirect("/");
}

async function getWebSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  const serviceClient = createWebSupabaseServiceClient();
  const repository = new SupabaseAppSessionRepository(serviceClient);
  const authResult = await requireWebAccess(cookieStore, {
    sessionRefresher: createServerStateSessionRefresher(repository),
  });

  if (!authResult.ok) {
    redirect("/dashboard");
  }

  return authResult.session;
}

async function getAuthorizedPageSession(): Promise<AppSession> {
  const session = await getWebSession();
  if (!canAccessUserAdminPage(session.effective_capabilities)) {
    redirect("/dashboard");
  }

  return session;
}

export function canAccessUserAdminPage(
  capabilities: readonly string[]
): boolean {
  // El módulo siempre lista usuarios; por eso `users:read` es parte del gate
  // base aunque crear y actualizar se autoricen por separado más abajo.
  return (
    capabilities.includes(USER_READ_CAPABILITY) &&
    USER_ADMIN_CAPABILITIES.some((capability) =>
      capabilities.includes(capability)
    )
  );
}

export function canRunUserAdminAction(
  capabilities: readonly string[],
  capability: string
): boolean {
  // Las Server Actions son invocables por POST directo; repetir el gate del
  // módulo evita mutaciones que la UI protegida no permitiría iniciar.
  return (
    canAccessUserAdminPage(capabilities) && capabilities.includes(capability)
  );
}

function canRenderRoleControls(capabilities: readonly string[]): boolean {
  // Ver roles y asignarlos son permisos distintos: no exponemos metadata de
  // roles a quien solo puede crear/editar usuarios sin administrar roles.
  return (
    capabilities.includes(ROLE_READ_CAPABILITY) &&
    capabilities.includes(ROLE_UPDATE_CAPABILITY)
  );
}

function buildUserManagementService(session: AppSession) {
  const serviceClient = createWebSupabaseServiceClient();
  const capabilitiesCache = new InMemoryEffectiveCapabilitiesCache();

  return createUserManagementService({
    authAdmin: new SupabaseAuthAdminAdapter({ client: serviceClient }),
    repository: new SupabaseUserManagementRepository(serviceClient),
    capabilityChecker: {
      async requireCapability(_scope, capabilityCode) {
        if (!session.effective_capabilities.includes(capabilityCode)) {
          throw new CapabilityDeniedError(
            session.user_id,
            session.tenant_id,
            capabilityCode
          );
        }
      },
    },
    capabilityInvalidator: {
      async invalidate(scope) {
        await capabilitiesCache.invalidate(scope);
      },
    },
  });
}

async function listRoles(
  tenantId: string
): Promise<readonly TenantRoleOption[]> {
  // Esta lectura usa service-role y salta RLS; el caller debe haber comprobado
  // `roles:read` antes de llegar acá.
  const { data, error } = await createWebSupabaseServiceClient()
    .from("roles")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as TenantRoleOption[]).map((role) => ({
    id: role.id,
    name: role.name,
  }));
}

async function lookupTenantName(tenantId: string): Promise<string> {
  const { data, error } = await createWebSupabaseServiceClient()
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single<{ name: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Tenant not found");
  }

  return data.name;
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createUserAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();
  if (
    !canRunUserAdminAction(
      session.effective_capabilities,
      USER_CREATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }
  const service = buildUserManagementService(session);
  const result = await service.createUser(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      email: getString(formData, "email"),
      temporaryPassword: getString(formData, "temporaryPassword"),
      fullName: getString(formData, "fullName"),
      phone: getString(formData, "phone"),
      roleIds: formData
        .getAll("roleIds")
        .filter((value): value is string => typeof value === "string"),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "create_user_failed");
  }

  revalidatePath("/dashboard/admin_usuarios");
}

export async function updateUserAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();
  if (
    !canRunUserAdminAction(
      session.effective_capabilities,
      USER_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }
  const service = buildUserManagementService(session);
  const roleIds = formData
    .getAll("roleIds")
    .filter((value): value is string => typeof value === "string");

  // When role checkboxes are rendered but all unchecked, the hidden field
  // `roleIdsPresent` signals that the admin can manage roles and intends to
  // clear them. Without this signal, `roleIds` is simply omitted — roles are
  // left untouched (e.g. when the admin lacks the `roles:update` capability).
  const hasRoleField = formData.has("roleIdsPresent");

  const result = await service.updateUser(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      userId: getString(formData, "userId"),
      fullName: getString(formData, "fullName"),
      phone: getString(formData, "phone"),
      ...(hasRoleField ? { roleIds } : roleIds.length > 0 ? { roleIds } : {}),
    }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "update_user_failed");
  }

  revalidatePath("/dashboard/admin_usuarios");
}

export async function deactivateUserAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedPageSession();
  if (
    !canRunUserAdminAction(
      session.effective_capabilities,
      USER_UPDATE_CAPABILITY
    )
  ) {
    redirect("/dashboard");
  }
  const service = buildUserManagementService(session);
  const result = await service.deactivateUser(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    { userId: getString(formData, "userId") }
  );

  if (!result.ok) {
    throw new Error(result.code ?? "deactivate_user_failed");
  }

  revalidatePath("/dashboard/admin_usuarios");
}

export default async function AdminUsuariosPage() {
  const session = await getAuthorizedPageSession();
  const service = buildUserManagementService(session);
  const [tenantName, roles, users] = await Promise.all([
    lookupTenantName(session.tenant_id),
    // Si la sesión no puede administrar roles, no hacemos la consulta: ocultar
    // checkboxes no alcanza porque los nombres/ids de roles también son datos.
    canRenderRoleControls(session.effective_capabilities)
      ? listRoles(session.tenant_id)
      : [],
    service.listUsers({
      tenant_id: session.tenant_id,
      user_id: session.user_id,
    }),
  ]);

  return renderUserAdminShell({
    tenantName,
    capabilities: session.effective_capabilities,
    roles,
    users,
    createAction: createUserAction,
    updateAction: updateUserAction,
    deactivateAction: deactivateUserAction,
  });
}

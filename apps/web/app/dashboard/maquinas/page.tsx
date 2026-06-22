import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  AppSession,
  FuelTypeCatalogSummary,
  MachineCatalogSummary,
} from "@faena360/domain";
import {
  SupabaseAppSessionRepository,
  SupabaseFuelTypeCatalogRepository,
} from "@faena360/infrastructure";

import {
  canAccessMachineCatalogPage,
  canRunMachineCatalogAction,
  changeMachineStatusAction,
  createMachineAction,
  FUEL_TYPES_READ_CAPABILITY,
  hideMachineAction,
  listVisibleMachinesForSession,
  MACHINE_CATALOG_PATH,
  MACHINES_CHANGE_STATUS_CAPABILITY,
  MACHINES_CREATE_CAPABILITY,
  MACHINES_UPDATE_CAPABILITY,
  updateMachineAction,
} from "./catalog";
import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";
import { DashboardSidebar } from "../_components/dashboard-sidebar";

type MachineCatalogShellInput = {
  readonly tenantName: string;
  readonly capabilities: readonly string[];
  readonly machines: readonly MachineCatalogSummary[];
  readonly fuelTypes: readonly FuelTypeCatalogSummary[];
  readonly createAction?: (formData: FormData) => Promise<void>;
  readonly updateAction?: (formData: FormData) => Promise<void>;
  readonly changeStatusAction?: (formData: FormData) => Promise<void>;
  readonly hideAction?: (formData: FormData) => Promise<void>;
};

const MACHINE_TYPES = [
  { value: "por_tiempo", label: "Por tiempo" },
  { value: "acarreo", label: "Acarreo" },
] as const;

const FUEL_MEASUREMENT_MODES = [
  { value: "sin_medicion", label: "Sin medición" },
  { value: "exacto", label: "Exacto" },
  {
    value: "aproximado_porcentaje",
    label: "Aproximado por porcentaje",
  },
] as const;

const STATUS_OPTIONS = [
  { value: "activa", label: "Activa" },
  { value: "en_mantenimiento", label: "En mantenimiento" },
  { value: "fuera_de_servicio", label: "Fuera de servicio" },
] as const;

export function renderMachineCatalogShell(input: MachineCatalogShellInput) {
  const canReadFuelTypes = input.capabilities.includes(
    FUEL_TYPES_READ_CAPABILITY
  );
  const activeFuelTypes = input.fuelTypes.filter(
    (fuelType) => fuelType.estado === "activo"
  );
  const canCreate =
    canReadFuelTypes &&
    canRunMachineCatalogAction(input.capabilities, MACHINES_CREATE_CAPABILITY);
  const canUpdate =
    canReadFuelTypes &&
    canRunMachineCatalogAction(input.capabilities, MACHINES_UPDATE_CAPABILITY);
  const canChangeStatus = canRunMachineCatalogAction(
    input.capabilities,
    MACHINES_CHANGE_STATUS_CAPABILITY
  );
  const hasFuelTypes = activeFuelTypes.length > 0;
  const canMutate = canCreate || canUpdate || canChangeStatus;
  const needsFuelTypeReadForMutation =
    !canReadFuelTypes &&
    (canRunMachineCatalogAction(
      input.capabilities,
      MACHINES_CREATE_CAPABILITY
    ) ||
      canRunMachineCatalogAction(
        input.capabilities,
        MACHINES_UPDATE_CAPABILITY
      ));

  return (
    <main className="min-h-screen bg-[#f5fbf7] text-[#102118]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <DashboardSidebar
          capabilities={input.capabilities}
          activeHref={MACHINE_CATALOG_PATH}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-8 px-6 py-8">
          <header className="rounded-2xl border border-[#dcebe1] bg-white p-8">
            <p className="text-sm font-medium text-[#0f5132]">
              {input.tenantName}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              Máquinas
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#385346]">
              Catálogo operativo de máquinas visibles del tenant autenticado.
            </p>
          </header>

          {!canMutate ? (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Catálogo visible en modo lectura.
            </p>
          ) : null}

          {needsFuelTypeReadForMutation ? (
            <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
              Necesitás acceso al catálogo de combustible para crear o editar
              máquinas.
            </p>
          ) : null}

          {canCreate ? (
            hasFuelTypes ? (
              <section className="rounded-2xl border border-[#dcebe1] bg-white p-6">
                <h2 className="text-xl font-semibold">Crear máquina</h2>
                <form
                  action={input.createAction}
                  className="mt-5 grid gap-4 md:grid-cols-2"
                >
                  <MachineFields fuelTypes={activeFuelTypes} />
                  <button className="login-button md:col-span-2" type="submit">
                    Crear máquina
                  </button>
                </form>
              </section>
            ) : (
              <p className="rounded-2xl border border-[#dcebe1] bg-white px-5 py-4 text-sm text-[#385346]">
                Necesitás al menos un tipo de combustible activo para crear
                máquinas.
              </p>
            )
          ) : null}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Máquinas visibles</h2>

            {input.machines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#b8d8c2] bg-white/80 p-8 text-center">
                <p className="font-semibold text-[#102118]">
                  Todavía no hay máquinas visibles.
                </p>
              </div>
            ) : null}

            {input.machines.map((machine) => {
              const machineFuelTypeOptions = resolveMachineFuelTypeOptions(
                input.fuelTypes,
                machine.tipo_combustible_id
              );

              return (
                <article
                  className="rounded-2xl border border-[#dcebe1] bg-white p-6"
                  key={machine.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{machine.codigo}</p>
                      <p className="mt-1 text-sm text-[#385346]">
                        Tipo: {formatMachineType(machine.tipo)}
                      </p>
                      <p className="mt-1 text-sm text-[#385346]">
                        Placa: {machine.placa ?? "Sin placa"}
                      </p>
                    </div>
                    <p className="rounded-full bg-[#e5f6ea] px-3 py-1 text-xs font-semibold text-[#0f5132]">
                      {formatMachineStatus(machine.estado)}
                    </p>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm text-[#385346] md:grid-cols-3">
                    <div>
                      <dt className="font-semibold text-[#173b29]">Tanque</dt>
                      <dd>{machine.tamanio_tanque}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-[#173b29]">Medición</dt>
                      <dd>
                        {formatFuelMeasurementMode(
                          machine.modo_medicion_combustible
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-[#173b29]">
                        Combustible
                      </dt>
                      <dd>
                        {canReadFuelTypes
                          ? lookupFuelTypeName(
                              input.fuelTypes,
                              machine.tipo_combustible_id
                            )
                          : "Sin acceso al catálogo de combustible."}
                      </dd>
                    </div>
                  </dl>

                  {canUpdate && machineFuelTypeOptions.length > 0 ? (
                    <form
                      action={input.updateAction}
                      className="mt-5 grid gap-4 md:grid-cols-2"
                    >
                      <input
                        name="machineId"
                        type="hidden"
                        value={machine.id}
                      />
                      <MachineFields
                        machine={machine}
                        fuelTypes={machineFuelTypeOptions}
                      />
                      <button
                        className="login-button md:col-span-2"
                        type="submit"
                      >
                        Guardar cambios
                      </button>
                    </form>
                  ) : null}

                  {canChangeStatus ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <form
                        action={input.changeStatusAction}
                        className="space-y-3 rounded-xl border border-[#dbedff] p-4"
                      >
                        <input
                          name="machineId"
                          type="hidden"
                          value={machine.id}
                        />
                        <label className="space-y-2 text-sm font-medium">
                          <span>Cambiar estado</span>
                          <select
                            className="login-input"
                            name="estado"
                            defaultValue={machine.estado}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="rounded-xl bg-[#e8f7ff] px-3 py-2 text-sm font-semibold text-[#005f8a]"
                          type="submit"
                        >
                          Cambiar estado
                        </button>
                      </form>

                      <form
                        action={input.hideAction}
                        className="space-y-3 rounded-xl border border-[#f5d0d0] p-4"
                      >
                        <input
                          name="machineId"
                          type="hidden"
                          value={machine.id}
                        />
                        <button
                          className="rounded-xl bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[#8a1f16]"
                          type="submit"
                        >
                          Ocultar máquina
                        </button>
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </section>
      </div>
    </main>
  );
}

function MachineFields({
  machine,
  fuelTypes,
}: {
  readonly machine?: MachineCatalogSummary;
  readonly fuelTypes: readonly FuelTypeCatalogSummary[];
}) {
  return (
    <>
      <label className="space-y-2 text-sm font-medium">
        <span>Código</span>
        <input
          className="login-input"
          name="codigo"
          required
          type="text"
          defaultValue={machine?.codigo ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Placa</span>
        <input
          className="login-input"
          name="placa"
          type="text"
          defaultValue={machine?.placa ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Tipo</span>
        <select
          className="login-input"
          name="tipo"
          defaultValue={machine?.tipo ?? "por_tiempo"}
        >
          {MACHINE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Tipo de combustible</span>
        <select
          className="login-input"
          name="tipo_combustible_id"
          defaultValue={machine?.tipo_combustible_id ?? fuelTypes[0]?.id ?? ""}
        >
          {fuelTypes.map((fuelType) => (
            <option key={fuelType.id} value={fuelType.id}>
              {formatFuelTypeOptionLabel(fuelType)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Tamaño de tanque</span>
        <input
          className="login-input"
          name="tamanio_tanque"
          required
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={machine?.tamanio_tanque ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Medición de combustible</span>
        <select
          className="login-input"
          name="modo_medicion_combustible"
          defaultValue={machine?.modo_medicion_combustible ?? "sin_medicion"}
        >
          {FUEL_MEASUREMENT_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Nivel inicial</span>
        <input
          className="login-input"
          name="nivel_inicial_combustible"
          type="number"
          min="0"
          step="0.01"
          defaultValue={machine?.nivel_inicial_combustible ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium">
        <span>Capacidad transporte m³</span>
        <input
          className="login-input"
          name="capacidad_transporte_m3"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={machine?.capacidad_transporte_m3 ?? ""}
        />
      </label>
      <label className="space-y-2 text-sm font-medium md:col-span-2">
        <span>Tarifa sugerida</span>
        <input
          className="login-input"
          name="tarifa_sugerida"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={machine?.tarifa_sugerida ?? ""}
        />
      </label>
    </>
  );
}

function formatMachineType(tipo: MachineCatalogSummary["tipo"]) {
  return tipo === "acarreo" ? "Acarreo" : "Por tiempo";
}

function formatMachineStatus(status: MachineCatalogSummary["estado"]) {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

function formatFuelMeasurementMode(
  mode: MachineCatalogSummary["modo_medicion_combustible"]
) {
  return (
    FUEL_MEASUREMENT_MODES.find((option) => option.value === mode)?.label ??
    mode
  );
}

function lookupFuelTypeName(
  fuelTypes: readonly FuelTypeCatalogSummary[],
  fuelTypeId: string
) {
  const fuelType = fuelTypes.find((candidate) => candidate.id === fuelTypeId);
  return fuelType ? formatFuelTypeOptionLabel(fuelType) : `ID ${fuelTypeId}`;
}

function formatFuelTypeOptionLabel(fuelType: FuelTypeCatalogSummary) {
  return fuelType.estado === "oculto"
    ? `${fuelType.nombre} (oculto)`
    : fuelType.nombre;
}

function resolveMachineFuelTypeOptions(
  fuelTypes: readonly FuelTypeCatalogSummary[],
  currentFuelTypeId: string
) {
  const activeFuelTypes = fuelTypes.filter(
    (fuelType) => fuelType.estado === "activo"
  );
  const currentFuelType = fuelTypes.find(
    (fuelType) => fuelType.id === currentFuelTypeId
  );

  if (!currentFuelType || currentFuelType.estado === "activo") {
    return activeFuelTypes;
  }

  return [...activeFuelTypes, currentFuelType];
}

async function getAuthorizedPageSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  const serviceClient = createWebSupabaseServiceClient();
  const repository = new SupabaseAppSessionRepository(serviceClient);
  const authResult = await requireWebAccess(cookieStore, {
    sessionRefresher: createServerStateSessionRefresher(repository),
  });
  if (!authResult.ok) {
    redirect("/dashboard");
  }
  if (!canAccessMachineCatalogPage(authResult.session.effective_capabilities)) {
    redirect("/dashboard");
  }
  return authResult.session;
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

async function listActiveFuelTypes(tenantId: string) {
  return new SupabaseFuelTypeCatalogRepository(
    createWebSupabaseServiceClient()
  ).listActive({ tenantId });
}

async function listMachineFuelTypesForCatalog(
  tenantId: string,
  referencedFuelTypeIds: readonly string[]
) {
  const activeFuelTypes = await listActiveFuelTypes(tenantId);
  const missingReferencedFuelTypeIds = referencedFuelTypeIds.filter(
    (fuelTypeId) =>
      fuelTypeId.length > 0 &&
      !activeFuelTypes.some((fuelType) => fuelType.id === fuelTypeId)
  );

  if (missingReferencedFuelTypeIds.length === 0) {
    return activeFuelTypes;
  }

  const { data, error } = await createWebSupabaseServiceClient()
    .from("tipos_combustible")
    .select("id,tenant_id,nombre,estado,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .in("id", missingReferencedFuelTypeIds)
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return [...activeFuelTypes, ...((data ?? []) as FuelTypeCatalogSummary[])];
}

export default async function MaquinasPage() {
  const session = await getAuthorizedPageSession();
  const canReadFuelTypes = session.effective_capabilities.includes(
    FUEL_TYPES_READ_CAPABILITY
  );
  const [tenantName, machines] = await Promise.all([
    lookupTenantName(session.tenant_id),
    listVisibleMachinesForSession(session),
  ]);
  const fuelTypes = canReadFuelTypes
    ? await listMachineFuelTypesForCatalog(
        session.tenant_id,
        machines.map((machine) => machine.tipo_combustible_id)
      )
    : [];

  return renderMachineCatalogShell({
    tenantName,
    capabilities: session.effective_capabilities,
    machines,
    fuelTypes,
    createAction: createMachineAction,
    updateAction: updateMachineAction,
    changeStatusAction: changeMachineStatusAction,
    hideAction: hideMachineAction,
  });
}

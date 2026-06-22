import type {
  ChangeMachineStatusInput,
  CreateMachineInput,
  CreateMachineOutcome,
  HideMachineInput,
  MachineCatalogRepository,
  MachineCatalogSummary,
  MachineEstado,
  MachineFuelMeasurementMode,
  MachineTipo,
  MutateMachineOutcome,
  UpdateMachineInput,
} from "@faena360/domain";

import { CapabilityDeniedError } from "../auth/effective-capabilities";

interface TenantSessionScope {
  readonly tenant_id: string;
  readonly user_id: string;
}

interface CapabilityScope {
  readonly tenantId: string;
  readonly userId: string;
}

export interface MachineCatalogServiceDependencies {
  readonly repository: MachineCatalogRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

export interface MachineCatalogService {
  listVisibleMachines(
    session: TenantSessionScope
  ): Promise<readonly MachineCatalogSummary[]>;
  createMachine(
    session: TenantSessionScope,
    input: CreateMachineInput
  ): Promise<CreateMachineOutcome>;
  updateMachine(
    session: TenantSessionScope,
    input: UpdateMachineInput
  ): Promise<MutateMachineOutcome>;
  changeMachineStatus(
    session: TenantSessionScope,
    input: ChangeMachineStatusInput
  ): Promise<MutateMachineOutcome>;
  hideMachine(
    session: TenantSessionScope,
    input: HideMachineInput
  ): Promise<MutateMachineOutcome>;
}

const MACHINES_READ_CAPABILITY = "machines:read" as const;
const MACHINES_CREATE_CAPABILITY = "machines:create" as const;
const MACHINES_UPDATE_CAPABILITY = "machines:update" as const;
const MACHINES_CHANGE_STATUS_CAPABILITY = "machines:change_status" as const;
const MACHINE_TYPES: ReadonlySet<MachineTipo> = new Set([
  "acarreo",
  "por_tiempo",
]);
const MACHINE_STATUSES: ReadonlySet<MachineEstado> = new Set([
  "activa",
  "en_mantenimiento",
  "fuera_de_servicio",
  "oculta",
]);
const FUEL_MEASUREMENT_MODES: ReadonlySet<MachineFuelMeasurementMode> = new Set(
  ["exacto", "aproximado_porcentaje", "sin_medicion"]
);

export function createMachineCatalogService({
  capabilityChecker,
  repository,
}: MachineCatalogServiceDependencies): MachineCatalogService {
  return {
    async listVisibleMachines(session) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error("Cannot list machines without tenant context.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        MACHINES_READ_CAPABILITY
      );

      return repository.listVisible({ tenantId });
    },

    async createMachine(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const normalized = normalizeMachineInput(input);
      if (!normalized.ok) {
        return normalized;
      }

      const capability = await requireCapability(
        capabilityChecker,
        session,
        tenantId,
        MACHINES_CREATE_CAPABILITY
      );
      if (!capability.ok) {
        return capability;
      }

      try {
        const created = await repository.create({
          tenantId,
          actorId: session.user_id,
          auditSource: "web",
          ...normalized.value,
        });
        return { ok: true, machineId: created.id };
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return { ok: false, code: "duplicate_codigo" };
        }
        return { ok: false, code: "machine_create_failed" };
      }
    },

    async updateMachine(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const machineId = input.machineId.trim();
      if (!machineId) {
        return { ok: false, code: "missing_machine" };
      }

      const normalized = normalizeMachineInput(input);
      if (!normalized.ok) {
        return normalized;
      }

      const capability = await requireCapability(
        capabilityChecker,
        session,
        tenantId,
        MACHINES_UPDATE_CAPABILITY
      );
      if (!capability.ok) {
        return capability;
      }

      try {
        const updated = await repository.update({
          tenantId,
          machineId,
          actorId: session.user_id,
          auditSource: "web",
          ...normalized.value,
        });
        return updated ? { ok: true } : { ok: false, code: "missing_machine" };
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return { ok: false, code: "duplicate_codigo" };
        }
        return { ok: false, code: "machine_update_failed" };
      }
    },

    async changeMachineStatus(session, input) {
      return changeMachineStatus(
        capabilityChecker,
        repository,
        session,
        input.machineId,
        input.estado
      );
    },

    async hideMachine(session, input) {
      return changeMachineStatus(
        capabilityChecker,
        repository,
        session,
        input.machineId,
        "oculta"
      );
    },
  };
}

async function changeMachineStatus(
  capabilityChecker: MachineCatalogServiceDependencies["capabilityChecker"],
  repository: MachineCatalogRepository,
  session: TenantSessionScope,
  machineIdInput: string,
  estadoInput: string
): Promise<MutateMachineOutcome> {
  const tenantId = resolveTenantId(session.tenant_id);
  if (!tenantId) {
    return { ok: false, code: "missing_tenant" };
  }

  const machineId = machineIdInput.trim();
  if (!machineId) {
    return { ok: false, code: "missing_machine" };
  }

  const estado = normalizeEstado(estadoInput);
  if (!estado) {
    return { ok: false, code: "invalid_estado" };
  }

  const capability = await requireCapability(
    capabilityChecker,
    session,
    tenantId,
    MACHINES_CHANGE_STATUS_CAPABILITY
  );
  if (!capability.ok) {
    return capability;
  }

  try {
    const updated = await repository.changeStatus({
      tenantId,
      machineId,
      actorId: session.user_id,
      auditSource: "web",
      estado,
    });
    return updated ? { ok: true } : { ok: false, code: "missing_machine" };
  } catch {
    return { ok: false, code: "machine_status_change_failed" };
  }
}

async function requireCapability(
  capabilityChecker: MachineCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<MutateMachineOutcome> {
  try {
    await capabilityChecker.requireCapability(
      { tenantId, userId: session.user_id },
      capabilityCode
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof CapabilityDeniedError) {
      return { ok: false, code: "capability_denied" };
    }
    throw error;
  }
}

function normalizeMachineInput(input: CreateMachineInput) {
  const codigo = input.codigo.trim();
  if (!codigo) {
    return { ok: false as const, code: "missing_codigo" as const };
  }

  const tipoCombustibleId = input.tipo_combustible_id.trim();
  if (!tipoCombustibleId) {
    return { ok: false as const, code: "missing_tipo_combustible" as const };
  }

  const tipo = normalizeTipo(input.tipo);
  if (!tipo) {
    return { ok: false as const, code: "invalid_tipo" as const };
  }

  const tamanioTanque = normalizePositiveNumber(input.tamanio_tanque);
  if (tamanioTanque == null) {
    return {
      ok: false as const,
      code: "invalid_tamanio_tanque" as const,
    };
  }

  const modo = normalizeFuelMeasurementMode(input.modo_medicion_combustible);
  if (!modo) {
    return {
      ok: false as const,
      code: "invalid_modo_medicion_combustible" as const,
    };
  }

  const nivel = normalizeNivelInicial(
    input.nivel_inicial_combustible,
    modo,
    tamanioTanque
  );
  if (nivel === undefined) {
    return {
      ok: false as const,
      code: "invalid_nivel_inicial_combustible" as const,
    };
  }

  const capacidad = normalizeOptionalPositiveNumber(
    input.capacidad_transporte_m3
  );
  if (input.capacidad_transporte_m3 != null && capacidad == null) {
    return {
      ok: false as const,
      code: "invalid_capacidad_transporte_m3" as const,
    };
  }

  const tarifa = normalizeOptionalPositiveNumber(input.tarifa_sugerida);
  if (input.tarifa_sugerida != null && tarifa == null) {
    return {
      ok: false as const,
      code: "invalid_tarifa_sugerida" as const,
    };
  }

  return {
    ok: true as const,
    value: {
      codigo,
      placa: normalizeOptionalString(input.placa),
      tipo,
      tipo_combustible_id: tipoCombustibleId,
      tamanio_tanque: tamanioTanque,
      modo_medicion_combustible: modo,
      nivel_inicial_combustible: nivel,
      capacidad_transporte_m3: tipo === "acarreo" ? capacidad : null,
      tarifa_sugerida: tarifa,
    },
  };
}

function normalizeTipo(input?: string): MachineTipo | null {
  const value = (input?.trim() || "por_tiempo") as MachineTipo;
  return MACHINE_TYPES.has(value) ? value : null;
}

function normalizeFuelMeasurementMode(
  input?: string
): MachineFuelMeasurementMode | null {
  const value = (input?.trim() || "sin_medicion") as MachineFuelMeasurementMode;
  return FUEL_MEASUREMENT_MODES.has(value) ? value : null;
}

function normalizeEstado(input: string): MachineEstado | null {
  const value = input.trim() as MachineEstado;
  return MACHINE_STATUSES.has(value) ? value : null;
}

function normalizeNivelInicial(
  input: number | null | undefined,
  modo: MachineFuelMeasurementMode,
  tamanioTanque: number
): number | null | undefined {
  if (input == null) {
    return modo === "sin_medicion" ? null : undefined;
  }
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    return undefined;
  }
  if (modo === "sin_medicion") {
    return null;
  }
  if (modo === "aproximado_porcentaje") {
    return input <= 100 ? input : undefined;
  }
  return input <= tamanioTanque ? input : undefined;
}

function normalizePositiveNumber(input: number): number | null {
  return typeof input === "number" && Number.isFinite(input) && input > 0
    ? input
    : null;
}

function normalizeOptionalPositiveNumber(
  input: number | null | undefined
): number | null {
  if (input == null) {
    return null;
  }
  return normalizePositiveNumber(input);
}

function normalizeOptionalString(input?: string | null): string | null {
  const value = input?.trim();
  return value ? value : null;
}

function resolveTenantId(tenantId?: string | null): string {
  return tenantId?.trim() ?? "";
}

function containsTenantOverride(input: unknown): boolean {
  const candidate = input as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(candidate, "tenant_id") ||
    Object.prototype.hasOwnProperty.call(candidate, "tenantId") ||
    Object.prototype.hasOwnProperty.call(candidate, "tenant")
  );
}

function isUniqueViolationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

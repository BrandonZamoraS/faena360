import type {
  AssignmentEstado,
  AssignmentHistoryEntry,
  AssignmentOutcome,
  CreateAssignmentInput,
  MachineAssignment,
  MachineAssignmentRepository,
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

export interface MachineAssignmentServiceDependencies {
  readonly repository: MachineAssignmentRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

export interface MachineAssignmentService {
  listActiveAssignments(
    session: TenantSessionScope
  ): Promise<readonly MachineAssignment[]>;
  createAssignment(
    session: TenantSessionScope,
    input: CreateAssignmentInput
  ): Promise<AssignmentOutcome>;
  updateAssignmentStatus(
    session: TenantSessionScope,
    assignmentId: string,
    estado: AssignmentEstado
  ): Promise<AssignmentOutcome>;
  withdrawAssignment(
    session: TenantSessionScope,
    assignmentId: string
  ): Promise<AssignmentOutcome>;

  listAssignmentHistory(
    session: TenantSessionScope,
    assignmentId: string
  ): Promise<readonly AssignmentHistoryEntry[]>;
}

const ASSIGNMENTS_READ_CAPABILITY = "assignments:read" as const;
const ASSIGNMENTS_CREATE_CAPABILITY = "assignments:create" as const;
const ASSIGNMENTS_UPDATE_CAPABILITY = "assignments:update" as const;
export const ASSIGNMENTS_WITHDRAW_CAPABILITY = "assignments:withdraw" as const;

const VALID_ESTADOS: ReadonlySet<AssignmentEstado> = new Set([
  "retirada_del_proyecto",
  "cerrada_por_finalizacion",
  "bloqueada_por_conflicto",
]);

export function createMachineAssignmentService({
  capabilityChecker,
  repository,
}: MachineAssignmentServiceDependencies): MachineAssignmentService {
  return {
    async listActiveAssignments(session) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error("Cannot list assignments without tenant context.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        ASSIGNMENTS_READ_CAPABILITY
      );

      return repository.listActive({ tenantId });
    },

    async createAssignment(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const normalized = normalizeCreateInput(input);
      if (!normalized.ok) {
        return normalized;
      }

      const capability = await requireCapability(
        capabilityChecker,
        session,
        tenantId,
        ASSIGNMENTS_CREATE_CAPABILITY
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
        return { ok: true, assignmentId: created.id };
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return { ok: false, code: "machine_already_assigned" };
        }
        if (isPermissionDeniedError(error)) {
          return { ok: false, code: "capability_denied" };
        }
        const validationCode = mapRpcValidationError(error);
        if (validationCode) {
          return { ok: false, code: validationCode };
        }
        return { ok: false, code: "assignment_create_failed" };
      }
    },

    async updateAssignmentStatus(session, assignmentId, estado) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }

      const normalizedId = assignmentId.trim();
      if (!normalizedId) {
        return { ok: false, code: "missing_assignment" };
      }

      if (!VALID_ESTADOS.has(estado)) {
        return { ok: false, code: "unknown_error" };
      }

      // Guard: withdrawal must go through withdrawAssignment, not updateAssignmentStatus.
      if (estado === "retirada_del_proyecto") {
        return { ok: false, code: "capability_denied" };
      }

      const capability = await requireCapability(
        capabilityChecker,
        session,
        tenantId,
        ASSIGNMENTS_UPDATE_CAPABILITY
      );
      if (!capability.ok) {
        return capability;
      }

      try {
        const updated = await repository.updateStatus({
          tenantId,
          assignmentId: normalizedId,
          actorId: session.user_id,
          auditSource: "web",
          estado,
        });
        return updated
          ? { ok: true }
          : { ok: false, code: "missing_assignment" };
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          return { ok: false, code: "capability_denied" };
        }
        if (isAssignmentNotActiveError(error)) {
          return { ok: false, code: "missing_assignment" };
        }
        return { ok: false, code: "assignment_update_failed" };
      }
    },

    async withdrawAssignment(session, assignmentId) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }

      const normalizedId = assignmentId.trim();
      if (!normalizedId) {
        return { ok: false, code: "missing_assignment" };
      }

      const capability = await requireCapability(
        capabilityChecker,
        session,
        tenantId,
        ASSIGNMENTS_WITHDRAW_CAPABILITY
      );
      if (!capability.ok) {
        return capability;
      }

      try {
        const updated = await repository.updateStatus({
          tenantId,
          assignmentId: normalizedId,
          actorId: session.user_id,
          auditSource: "web",
          estado: "retirada_del_proyecto",
        });
        return updated
          ? { ok: true }
          : { ok: false, code: "missing_assignment" };
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          return { ok: false, code: "capability_denied" };
        }
        if (isAssignmentNotActiveError(error)) {
          return { ok: false, code: "missing_assignment" };
        }
        return { ok: false, code: "assignment_update_failed" };
      }
    },

    async listAssignmentHistory(session, assignmentId) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error(
          "Cannot list assignment history without tenant context."
        );
      }

      const normalizedId = assignmentId.trim();
      if (!normalizedId) {
        throw new Error("Assignment id is required for history lookup.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        ASSIGNMENTS_READ_CAPABILITY
      );

      return repository.listHistory({
        tenantId,
        actorId: session.user_id,
        assignmentId: normalizedId,
      });
    },
  };
}

async function requireCapability(
  capabilityChecker: MachineAssignmentServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<AssignmentOutcome> {
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

function normalizeCreateInput(input: CreateAssignmentInput) {
  const maquina_id = input.maquina_id.trim();
  if (!maquina_id) {
    return { ok: false as const, code: "missing_maquina" as const };
  }

  const proyecto_id = input.proyecto_id.trim();
  if (!proyecto_id) {
    return { ok: false as const, code: "missing_proyecto" as const };
  }

  const operador_id = input.operador_id.trim();
  if (!operador_id) {
    return { ok: false as const, code: "missing_operador" as const };
  }

  const tarifa_aplicada = normalizeTarifa(input.tarifa_aplicada);
  if (tarifa_aplicada === undefined) {
    return { ok: false as const, code: "missing_tarifa" as const };
  }

  return {
    ok: true as const,
    value: {
      maquina_id,
      proyecto_id,
      subproyecto_id: normalizeOptionalId(input.subproyecto_id),
      operador_id,
      tarifa_aplicada,
    },
  };
}

function normalizeTarifa(input: number): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    return undefined;
  }
  return input;
}

function normalizeOptionalId(input?: string | null): string | null {
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

function isPermissionDeniedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "42501"
  );
}

function isAssignmentNotActiveError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "ASG01" || code === "ASG02";
}

/**
 * Maps RPC validation error codes returned by create_asignacion to
 * domain-specific AssignmentErrorCode values.
 *
 * RPC errcode mapping:
 *   MCH01 → machine not found         → generic (null)
 *   MCH02 → not por_tiempo            → machine_not_por_tiempo
 *   MCH03 → not active (machine)      → machine_not_active
 *   PRJ01 → project not found         → generic (null)
 *   PRJ02 → project not active        → project_not_active
 *   SUB01 → subproject not found      → generic (null)
 *   USR01 → user not operador         → user_not_operador
 */
function mapRpcValidationError(
  error: unknown
):
  | "machine_not_por_tiempo"
  | "machine_not_active"
  | "project_not_active"
  | "user_not_operador"
  | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as { code?: string }).code;
  switch (code) {
    case "MCH02":
      return "machine_not_por_tiempo";
    case "MCH03":
      return "machine_not_active";
    case "PRJ02":
      return "project_not_active";
    case "USR01":
      return "user_not_operador";
    default:
      return null;
  }
}

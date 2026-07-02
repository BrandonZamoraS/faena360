import type {
  CreateSubprojectInput,
  CreateSubprojectOutcome,
  FinishSubprojectInput,
  HideSubprojectInput,
  MutateSubprojectOutcome,
  ReopenSubprojectInput,
  SubprojectCatalogRepository,
  SubprojectCatalogSummary,
  SubprojectEstado,
  SubprojectFormaCobro,
  UpdateSubprojectInput,
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

export interface SubprojectCatalogServiceDependencies {
  readonly repository: SubprojectCatalogRepository & {
    getParentFixedAmount(
      tenantId: string,
      proyecto_id: string
    ): Promise<number | null>;
    getSubprojectFixedAmountSum(
      tenantId: string,
      proyecto_id: string,
      excludeSubprojectId?: string
    ): Promise<number>;
  };
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

export interface SubprojectCatalogService {
  listVisibleSubprojects(
    session: TenantSessionScope
  ): Promise<readonly SubprojectCatalogSummary[]>;

  createSubproject(
    session: TenantSessionScope,
    input: CreateSubprojectInput
  ): Promise<CreateSubprojectOutcome>;

  updateSubproject(
    session: TenantSessionScope,
    input: UpdateSubprojectInput
  ): Promise<MutateSubprojectOutcome>;

  finishSubproject(
    session: TenantSessionScope,
    input: FinishSubprojectInput
  ): Promise<MutateSubprojectOutcome>;

  reopenSubproject(
    session: TenantSessionScope,
    input: ReopenSubprojectInput
  ): Promise<MutateSubprojectOutcome>;

  hideSubproject(
    session: TenantSessionScope,
    input: HideSubprojectInput
  ): Promise<MutateSubprojectOutcome>;
}

const SUBPROJECTS_READ_CAPABILITY = "subprojects:read" as const;
const SUBPROJECTS_CREATE_CAPABILITY = "subprojects:create" as const;
const SUBPROJECTS_UPDATE_CAPABILITY = "subprojects:update" as const;
const SUBPROJECTS_FINISH_CAPABILITY = "subprojects:finish" as const;
const SUBPROJECTS_REOPEN_CAPABILITY = "subprojects:reopen" as const;
const SUBPROJECTS_HIDE_CAPABILITY = "subprojects:hide" as const;

const ALLOWED_FORMAS_COBRO: ReadonlySet<SubprojectFormaCobro> = new Set([
  "monto_fijo",
  "por_horas",
  "por_dia",
]);

const ERROR_MESSAGE_FRAGMENTS = {
  parentProjectFinished: "parent project is finalized",
  finishInvalidState: "Cannot finish a subproject that is not",
  reopenInvalidState: "Cannot reopen a non-finalized",
  hideInvalidState: "Cannot hide a subproject that is not",
} as const;

export function createSubprojectCatalogService({
  capabilityChecker,
  repository,
}: SubprojectCatalogServiceDependencies): SubprojectCatalogService {
  return {
    async listVisibleSubprojects(session) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error("Cannot list subprojects without tenant context.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        SUBPROJECTS_READ_CAPABILITY
      );

      return repository.listVisible({ tenantId });
    },

    async createSubproject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      // Validate raw forma_cobro before normalization (distinguish
      // "not provided" from "provided but invalid")
      if (
        input.forma_cobro !== undefined &&
        !ALLOWED_FORMAS_COBRO.has(input.forma_cobro as SubprojectFormaCobro)
      ) {
        return { ok: false, code: "invalid_forma_cobro" };
      }

      const normalized = normalizeSubprojectInput(input);
      if (!normalized.nombre) {
        return { ok: false, code: "missing_nombre" };
      }
      if (!normalized.proyecto_id) {
        return { ok: false, code: "missing_parent_project" };
      }

      // Fixed-amount sum guard — must also trigger when forma_cobro/monto_fijo
      // are inherited from a parent that uses monto_fijo billing.
      let effectiveFormaCobro = normalized.forma_cobro;
      let effectiveMontoFijo = normalized.monto_fijo;

      if (!effectiveFormaCobro && normalized.proyecto_id) {
        const parentMonto = await repository.getParentFixedAmount(
          tenantId,
          normalized.proyecto_id
        );
        if (parentMonto !== null) {
          // Parent uses monto_fijo billing — RPC will inherit both.
          effectiveFormaCobro = "monto_fijo";
          effectiveMontoFijo = effectiveMontoFijo ?? parentMonto;
        }
      }

      if (
        effectiveFormaCobro === "monto_fijo" &&
        effectiveMontoFijo !== undefined
      ) {
        const exceeded = await checkFixedAmountSum(
          repository,
          tenantId,
          normalized.proyecto_id,
          effectiveMontoFijo
        );
        if (exceeded) {
          return { ok: false, code: "fixed_amount_exceeds_parent" };
        }
      }

      try {
        await requireActorCapability(
          capabilityChecker,
          session,
          tenantId,
          SUBPROJECTS_CREATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return { ok: false, code: "capability_denied" };
        }
        throw error;
      }

      try {
        const created = await repository.create({
          tenantId,
          actorId: session.user_id,
          auditSource: "web",
          proyecto_id: normalized.proyecto_id,
          nombre: normalized.nombre,
          ubicacion: normalized.ubicacion,
          forma_cobro: normalized.forma_cobro,
          monto_fijo: normalized.monto_fijo,
        });

        return { ok: true, subprojectId: created.id };
      } catch (error) {
        const mapped = mapCreateUpdateError(error);
        if (mapped === "duplicate_nombre") {
          return { ok: false, code: mapped };
        }
        return { ok: false, code: "subproject_create_failed" };
      }
    },

    async updateSubproject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const subprojectId = input.subprojectId.trim();
      if (!subprojectId) {
        return { ok: false, code: "missing_project" };
      }

      // Validate raw forma_cobro before normalization (distinguish
      // "not provided" from "provided but invalid")
      if (
        input.forma_cobro !== undefined &&
        !ALLOWED_FORMAS_COBRO.has(input.forma_cobro as SubprojectFormaCobro)
      ) {
        return { ok: false, code: "invalid_forma_cobro" };
      }

      const normalized = normalizeSubprojectInput(input);
      if (!normalized.nombre) {
        return { ok: false, code: "missing_nombre" };
      }

      // 🔒 Fetch server-sourced proyecto_id to prevent client manipulation.
      const actualProyectoId = await repository.getProjectId(
        tenantId,
        subprojectId
      );
      if (!actualProyectoId) {
        return { ok: false, code: "missing_project" };
      }

      // Fixed-amount sum guard (exclude current subproject from sum)
      if (
        normalized.forma_cobro === "monto_fijo" &&
        normalized.monto_fijo !== undefined
      ) {
        const exceeded = await checkFixedAmountSum(
          repository,
          tenantId,
          actualProyectoId,
          normalized.monto_fijo,
          subprojectId
        );
        if (exceeded) {
          return { ok: false, code: "fixed_amount_exceeds_parent" };
        }
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        SUBPROJECTS_UPDATE_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const updated = await repository.update({
          tenantId,
          subprojectId,
          actorId: session.user_id,
          auditSource: "web",
          nombre: normalized.nombre,
          ubicacion: normalized.ubicacion,
          forma_cobro: normalized.forma_cobro,
          monto_fijo: normalized.monto_fijo,
        });
        if (!updated) {
          return { ok: false, code: "missing_project" };
        }

        return { ok: true };
      } catch (error) {
        const mapped = mapCreateUpdateError(error);
        if (mapped === "duplicate_nombre") {
          return { ok: false, code: mapped };
        }
        return { ok: false, code: "subproject_update_failed" };
      }
    },

    async finishSubproject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const subprojectId = input.subprojectId.trim();
      if (!subprojectId) {
        return { ok: false, code: "missing_project" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        SUBPROJECTS_FINISH_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const closedCount = await repository.finish({
          tenantId,
          subprojectId,
          actorId: session.user_id,
          auditSource: "web",
          force: Boolean(input.force),
          reason: input.reason?.trim(),
          closeAssignments: input.closeAssignments ?? true,
        });
        if (closedCount === -1) {
          return { ok: false, code: "missing_project" };
        }
        return { ok: true, closedAssignmentsCount: closedCount };
      } catch (error) {
        return {
          ok: false,
          code: mapTransitionError(error, "finish"),
        };
      }
    },

    async reopenSubproject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const subprojectId = input.subprojectId.trim();
      if (!subprojectId) {
        return { ok: false, code: "missing_project" };
      }

      const targetEstado = normalizeReopenTargetEstado(input.target_estado);
      if (!targetEstado) {
        return { ok: false, code: "invalid_transition" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        SUBPROJECTS_REOPEN_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const reopened = await repository.reopen({
          tenantId,
          subprojectId,
          actorId: session.user_id,
          auditSource: "web",
          target_estado: targetEstado,
        });
        if (!reopened) {
          return { ok: false, code: "missing_project" };
        }
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          code: mapTransitionError(error, "reopen"),
        };
      }
    },

    async hideSubproject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }

      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const subprojectId = input.subprojectId.trim();
      if (!subprojectId) {
        return { ok: false, code: "missing_project" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        SUBPROJECTS_HIDE_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const hidden = await repository.hide({
          tenantId,
          subprojectId,
          actorId: session.user_id,
          auditSource: "web",
        });
        if (!hidden) {
          return { ok: false, code: "missing_project" };
        }
        return { ok: true };
      } catch {
        return { ok: false, code: "subproject_hide_failed" };
      }
    },
  };
}

// ── Capability helpers ─────────────────────────────────────────────

async function requireMutationCapability(
  capabilityChecker: SubprojectCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<MutateSubprojectOutcome> {
  try {
    await requireActorCapability(
      capabilityChecker,
      session,
      tenantId,
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

async function requireActorCapability(
  capabilityChecker: SubprojectCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<void> {
  await capabilityChecker.requireCapability(
    { tenantId, userId: session.user_id },
    capabilityCode
  );
}

// ── Input validation ───────────────────────────────────────────────

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

function normalizeSubprojectInput(
  input: CreateSubprojectInput | UpdateSubprojectInput
) {
  const forma_cobro = normalizeFormaCobro(input.forma_cobro);

  return {
    nombre: input.nombre.trim(),
    proyecto_id: "proyecto_id" in input ? input.proyecto_id.trim() : undefined,
    ubicacion: input.ubicacion?.trim() || undefined,
    forma_cobro,
    monto_fijo:
      forma_cobro === "monto_fijo" && input.monto_fijo !== undefined
        ? input.monto_fijo
        : undefined,
  };
}

function normalizeFormaCobro(forma?: string): SubprojectFormaCobro | undefined {
  return ALLOWED_FORMAS_COBRO.has(forma as SubprojectFormaCobro)
    ? (forma as SubprojectFormaCobro)
    : undefined;
}

function normalizeReopenTargetEstado(
  targetEstado: SubprojectEstado | undefined
): SubprojectEstado | undefined {
  if (targetEstado === undefined) {
    return "activo";
  }

  if (targetEstado === "activo" || targetEstado === "pausado") {
    return targetEstado;
  }

  return undefined;
}

// ── Fixed-amount sum guard ─────────────────────────────────────────

async function checkFixedAmountSum(
  repository: SubprojectCatalogServiceDependencies["repository"],
  tenantId: string,
  proyecto_id: string,
  inputMontoFijo: number,
  excludeSubprojectId?: string
): Promise<boolean> {
  const parentLimit = await repository.getParentFixedAmount(
    tenantId,
    proyecto_id
  );

  // If parent has no fixed amount set, no guard applies
  if (parentLimit === null || parentLimit === undefined) {
    return false;
  }

  const existingSum = await repository.getSubprojectFixedAmountSum(
    tenantId,
    proyecto_id,
    excludeSubprojectId
  );

  return inputMontoFijo + existingSum > parentLimit;
}

// ── Error mapping ──────────────────────────────────────────────────

function mapCreateUpdateError(error: unknown): "duplicate_nombre" | "unknown" {
  const message = normalizeErrorMessage(error);

  if (isDuplicateNameMessage(message)) {
    return "duplicate_nombre";
  }

  return "unknown";
}

function mapTransitionError(
  error: unknown,
  operation: "finish" | "reopen"
):
  | "parent_project_finished"
  | "invalid_transition"
  | "subproject_finish_failed"
  | "subproject_reopen_failed" {
  const message = normalizeErrorMessage(error);

  if (message.includes(ERROR_MESSAGE_FRAGMENTS.parentProjectFinished)) {
    return "parent_project_finished";
  }

  if (
    (operation === "finish" &&
      message.includes(ERROR_MESSAGE_FRAGMENTS.finishInvalidState)) ||
    (operation === "reopen" &&
      message.includes(ERROR_MESSAGE_FRAGMENTS.reopenInvalidState))
  ) {
    return "invalid_transition";
  }

  if (operation === "finish") {
    return "subproject_finish_failed";
  }

  return "subproject_reopen_failed";
}

function isDuplicateNameMessage(message: string): boolean {
  return (
    message.includes("duplicate key value") ||
    message.includes("duplicate key value violates unique constraint")
  );
}

function normalizeErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
}

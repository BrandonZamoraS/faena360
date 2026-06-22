import type {
  CreateProjectInput,
  CreateProjectOutcome,
  FinishProjectInput,
  HideProjectInput,
  MutateProjectOutcome,
  PauseProjectInput,
  ProjectCatalogRepository,
  ProjectCatalogSummary,
  ProjectEstado,
  ProjectFormaCobro,
  ReopenProjectInput,
  UpdateProjectInput,
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

export interface ProjectCatalogServiceDependencies {
  readonly repository: ProjectCatalogRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

export interface ProjectCatalogService {
  listVisibleProjects(session: TenantSessionScope): Promise<readonly ProjectCatalogSummary[]>;

  createProject(
    session: TenantSessionScope,
    input: CreateProjectInput
  ): Promise<CreateProjectOutcome>;

  updateProject(
    session: TenantSessionScope,
    input: UpdateProjectInput
  ): Promise<MutateProjectOutcome>;

  pauseProject(
    session: TenantSessionScope,
    input: PauseProjectInput
  ): Promise<MutateProjectOutcome>;

  finishProject(
    session: TenantSessionScope,
    input: FinishProjectInput
  ): Promise<MutateProjectOutcome>;

  reopenProject(
    session: TenantSessionScope,
    input: ReopenProjectInput
  ): Promise<MutateProjectOutcome>;

  hideProject(session: TenantSessionScope, input: HideProjectInput): Promise<MutateProjectOutcome>;
}

const PROJECTS_READ_CAPABILITY = "projects:read" as const;
const PROJECTS_CREATE_CAPABILITY = "projects:create" as const;
const PROJECTS_UPDATE_CAPABILITY = "projects:update" as const;
const PROJECTS_PAUSE_CAPABILITY = "projects:pause" as const;
const PROJECTS_FINISH_CAPABILITY = "projects:finish" as const;
const PROJECTS_REOPEN_CAPABILITY = "projects:reopen" as const;
const PROJECTS_HIDE_CAPABILITY = "projects:hide" as const;

const ALLOWED_FORMAS_COBRO: ReadonlySet<ProjectFormaCobro> = new Set([
  "monto_fijo",
  "por_horas",
  "por_dia",
]);

const ERROR_MESSAGE_FRAGMENTS = {
  missingClient: "Referenced client is missing or not active for this tenant",
  openJornadas: "open jornadas",
  missingReason: "requires a reason",
  pauseInvalidState: "Cannot pause a project that is not active",
  finishInvalidState: "Cannot finish a project that is not active or paused",
  reopenInvalidState: "Cannot reopen a non-finalized project",
  reopenInvalidTarget: "Reopen target state must be activo or pausado",
} as const;

export function createProjectCatalogService({
  capabilityChecker,
  repository,
}: ProjectCatalogServiceDependencies): ProjectCatalogService {
  return {
    async listVisibleProjects(session) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error("Cannot list projects without tenant context.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        PROJECTS_READ_CAPABILITY
      );

      return repository.listVisible({ tenantId });
    },

    async createProject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const normalized = normalizeProjectInput(input);
      if (!normalized.nombre) {
        return { ok: false, code: "missing_nombre" };
      }
      if (!normalized.cliente_id) {
        return { ok: false, code: "missing_cliente" };
      }
      if (!normalized.ubicacion) {
        return { ok: false, code: "missing_ubicacion" };
      }
      if (!normalized.fecha_inicio) {
        return { ok: false, code: "missing_fecha_inicio" };
      }
      if (!normalized.forma_cobro || !ALLOWED_FORMAS_COBRO.has(normalized.forma_cobro)) {
        return { ok: false, code: "invalid_forma_cobro" };
      }
      if (normalized.forma_cobro === "monto_fijo" && normalized.monto_fijo === undefined) {
        return { ok: false, code: "missing_monto_fijo" };
      }

      try {
        await requireActorCapability(
          capabilityChecker,
          session,
          tenantId,
          PROJECTS_CREATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return { ok: false, code: "capability_denied" };
        }
        throw error;
      }

      try {
        const createdProject = await repository.create({
          tenantId,
          actorId: session.user_id,
          auditSource: "web",
          ...normalized,
          forma_cobro: normalized.forma_cobro as ProjectFormaCobro,
        });

        return { ok: true, projectId: createdProject.id };
      } catch (error) {
        const mapped = mapCreateUpdateError(error, "create");
        if (mapped === "duplicate_nombre") {
          return { ok: false, code: mapped };
        }
        if (mapped === "inactive_cliente") {
          return { ok: false, code: "inactive_cliente" };
        }
        return { ok: false, code: "project_create_failed" };
      }
    },

    async updateProject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const projectId = input.projectId.trim();
      if (!projectId) {
        return { ok: false, code: "missing_project" };
      }

      const normalized = normalizeProjectInput(input);
      if (!normalized.nombre) {
        return { ok: false, code: "missing_nombre" };
      }
      if (!normalized.cliente_id) {
        return { ok: false, code: "missing_cliente" };
      }
      if (!normalized.ubicacion) {
        return { ok: false, code: "missing_ubicacion" };
      }
      if (!normalized.fecha_inicio) {
        return { ok: false, code: "missing_fecha_inicio" };
      }
      if (!normalized.forma_cobro || !ALLOWED_FORMAS_COBRO.has(normalized.forma_cobro)) {
        return { ok: false, code: "invalid_forma_cobro" };
      }
      if (normalized.forma_cobro === "monto_fijo" && normalized.monto_fijo === undefined) {
        return { ok: false, code: "missing_monto_fijo" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        PROJECTS_UPDATE_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const updated = await repository.update({
          tenantId,
          projectId,
          actorId: session.user_id,
          auditSource: "web",
          ...normalized,
          forma_cobro: normalized.forma_cobro as ProjectFormaCobro,
          fecha_finalizacion: normalizeOptionalDate(input.fecha_finalizacion),
        });
        if (!updated) {
          return { ok: false, code: "missing_project" };
        }

        return { ok: true };
      } catch (error) {
        const mapped = mapCreateUpdateError(error, "update");
        if (mapped === "duplicate_nombre") {
          return { ok: false, code: mapped };
        }
        if (mapped === "inactive_cliente") {
          return { ok: false, code: "inactive_cliente" };
        }
        return { ok: false, code: "project_update_failed" };
      }
    },

    async pauseProject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const projectId = input.projectId.trim();
      if (!projectId) {
        return { ok: false, code: "missing_project" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        PROJECTS_PAUSE_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const paused = await repository.pause({
          tenantId,
          projectId,
          actorId: session.user_id,
          auditSource: "web",
          force: Boolean(input.force),
          reason: input.reason?.trim(),
        });
        if (!paused) {
          return { ok: false, code: "missing_project" };
        }
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          code: mapTransitionError(error, "pause"),
        };
      }
    },

    async finishProject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const projectId = input.projectId.trim();
      if (!projectId) {
        return { ok: false, code: "missing_project" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        PROJECTS_FINISH_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const finished = await repository.finish({
          tenantId,
          projectId,
          actorId: session.user_id,
          auditSource: "web",
          force: Boolean(input.force),
          reason: input.reason?.trim(),
        });
        if (!finished) {
          return { ok: false, code: "missing_project" };
        }
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          code: mapTransitionError(error, "finish"),
        };
      }
    },

    async reopenProject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const projectId = input.projectId.trim();
      if (!projectId) {
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
        PROJECTS_REOPEN_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const reopened = await repository.reopen({
          tenantId,
          projectId,
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

    async hideProject(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }

      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const projectId = input.projectId.trim();
      if (!projectId) {
        return { ok: false, code: "missing_project" };
      }

      const capabilityResult = await requireMutationCapability(
        capabilityChecker,
        session,
        tenantId,
        PROJECTS_HIDE_CAPABILITY
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const hidden = await repository.hide({
          tenantId,
          projectId,
          actorId: session.user_id,
          auditSource: "web",
        });
        if (!hidden) {
          return { ok: false, code: "missing_project" };
        }
        return { ok: true };
      } catch {
        return { ok: false, code: "project_hide_failed" };
      }
    },
  };
}

async function requireMutationCapability(
  capabilityChecker: ProjectCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<MutateProjectOutcome> {
  try {
    await requireActorCapability(capabilityChecker, session, tenantId, capabilityCode);
    return { ok: true };
  } catch (error) {
    if (error instanceof CapabilityDeniedError) {
      return { ok: false, code: "capability_denied" };
    }
    throw error;
  }
}

async function requireActorCapability(
  capabilityChecker: ProjectCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string,
  capabilityCode: string
): Promise<void> {
  await capabilityChecker.requireCapability(
    { tenantId, userId: session.user_id },
    capabilityCode
  );
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

function normalizeProjectInput(input: CreateProjectInput | UpdateProjectInput) {
  const forma_cobro = normalizeProjectForma(input.forma_cobro);

  return {
    nombre: input.nombre.trim(),
    cliente_id: input.cliente_id.trim(),
    ubicacion: input.ubicacion.trim(),
    fecha_inicio: input.fecha_inicio.trim(),
    forma_cobro,
    monto_fijo:
      forma_cobro === "monto_fijo" && input.monto_fijo !== undefined
        ? input.monto_fijo
        : undefined,
  };
}

function normalizeProjectForma(
  forma: string
): ProjectFormaCobro | undefined {
  return ALLOWED_FORMAS_COBRO.has(forma as ProjectFormaCobro)
    ? (forma as ProjectFormaCobro)
    : undefined;
}

function normalizeReopenTargetEstado(
  targetEstado: ProjectEstado | undefined
): ProjectEstado | undefined {
  if (targetEstado === undefined) {
    return "activo";
  }

  if (targetEstado === "activo" || targetEstado === "pausado") {
    return targetEstado;
  }

  return undefined;
}

function normalizeOptionalDate(
  fechaFinalizacion: string | null | undefined
): string | null | undefined {
  if (fechaFinalizacion === undefined) {
    return undefined;
  }

  if (fechaFinalizacion === null) {
    return null;
  }

  const trimmed = fechaFinalizacion.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function mapCreateUpdateError(
  error: unknown,
  operation: "create" | "update"
): "duplicate_nombre" | "inactive_cliente" | "unknown" {
  const message = normalizeErrorMessage(error);

  if (isDuplicateNameError(error, message) || isDuplicateNameMessage(message)) {
    return "duplicate_nombre";
  }

  if (message.includes(ERROR_MESSAGE_FRAGMENTS.missingClient)) {
    return "inactive_cliente";
  }

  if (operation === "create") {
    void operation;
  }

  return "unknown";
}

function mapTransitionError(
  error: unknown,
  operation: "pause" | "finish" | "reopen"
):
  | "open_jornadas_blocking"
  | "missing_forced_reason"
  | "invalid_transition"
  | "project_pause_failed"
  | "project_finish_failed"
  | "project_reopen_failed" {
  const message = normalizeErrorMessage(error);

  if (message.includes(ERROR_MESSAGE_FRAGMENTS.openJornadas)) {
    return "open_jornadas_blocking";
  }

  if (message.includes(ERROR_MESSAGE_FRAGMENTS.missingReason)) {
    return "missing_forced_reason";
  }

  if (
    message.includes(ERROR_MESSAGE_FRAGMENTS.pauseInvalidState) ||
    message.includes(ERROR_MESSAGE_FRAGMENTS.finishInvalidState) ||
    message.includes(ERROR_MESSAGE_FRAGMENTS.reopenInvalidState) ||
    message.includes(ERROR_MESSAGE_FRAGMENTS.reopenInvalidTarget)
  ) {
    return "invalid_transition";
  }

  if (operation === "pause") {
    return "project_pause_failed";
  }

  if (operation === "finish") {
    return "project_finish_failed";
  }

  return "project_reopen_failed";
}

function isDuplicateNameMessage(message: string): boolean {
  return message.includes("duplicate key value") || message.includes("duplicate key value violates unique constraint");
}

function isDuplicateNameError(
  error: unknown,
  message: string
): boolean {
  return isUniqueViolationCode(error) || isDuplicateNameMessage(message);
}

function isUniqueViolationCode(error: unknown): boolean {
  return getErrorCode(error) === "23505";
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null) {
    return (error as { code?: string }).code;
  }

  return undefined;
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

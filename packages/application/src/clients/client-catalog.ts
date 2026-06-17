import type {
  ClientCatalogRepository,
  ClientCatalogSummary,
  CreateClientInput,
  CreateClientOutcome,
  HideClientInput,
  MutateClientOutcome,
  UpdateClientInput,
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

export interface ClientCatalogServiceDependencies {
  readonly repository: ClientCatalogRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

export interface ClientCatalogService {
  listActiveClients(
    session: TenantSessionScope
  ): Promise<readonly ClientCatalogSummary[]>;

  createClient(
    session: TenantSessionScope,
    input: CreateClientInput
  ): Promise<CreateClientOutcome>;

  updateClient(
    session: TenantSessionScope,
    input: UpdateClientInput
  ): Promise<MutateClientOutcome>;

  hideClient(
    session: TenantSessionScope,
    input: HideClientInput
  ): Promise<MutateClientOutcome>;
}

interface NormalizedClientInput {
  readonly nombre: string;
  readonly telefono?: string;
  readonly correo?: string;
  readonly identificacion?: string;
  readonly direccion?: string;
}

const CLIENTS_READ_CAPABILITY = "clients:read" as const;
const CLIENTS_CREATE_CAPABILITY = "clients:create" as const;
const CLIENTS_UPDATE_CAPABILITY = "clients:update" as const;

export function createClientCatalogService({
  capabilityChecker,
  repository,
}: ClientCatalogServiceDependencies): ClientCatalogService {
  return {
    async listActiveClients(session) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error("Cannot list clients without tenant context.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        CLIENTS_READ_CAPABILITY
      );

      return repository.listActive({ tenantId });
    },

    async createClient(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const normalizedInput = normalizeClientInput(input);
      if (!normalizedInput.nombre) {
        return { ok: false, code: "missing_nombre" };
      }

      try {
        await requireActorCapability(
          capabilityChecker,
          session,
          tenantId,
          CLIENTS_CREATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return { ok: false, code: "capability_denied" };
        }
        throw error;
      }

      try {
        const createdClient = await repository.create({
          tenantId,
          ...normalizedInput,
        });
        return { ok: true, clientId: createdClient.id };
      } catch {
        return { ok: false, code: "client_create_failed" };
      }
    },

    async updateClient(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const clientId = input.clientId.trim();
      if (!clientId) {
        return { ok: false, code: "missing_client" };
      }

      const normalizedInput = normalizeClientInput(input);
      if (!normalizedInput.nombre) {
        return { ok: false, code: "missing_nombre" };
      }

      const capabilityResult = await requireUpdateCapability(
        capabilityChecker,
        session,
        tenantId
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const updated = await repository.update({
          tenantId,
          clientId,
          ...normalizedInput,
        });
        if (!updated) {
          return { ok: false, code: "missing_client" };
        }

        return { ok: true };
      } catch {
        return { ok: false, code: "client_update_failed" };
      }
    },

    async hideClient(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const clientId = input.clientId.trim();
      if (!clientId) {
        return { ok: false, code: "missing_client" };
      }

      const capabilityResult = await requireUpdateCapability(
        capabilityChecker,
        session,
        tenantId
      );
      if (!capabilityResult.ok) {
        return capabilityResult;
      }

      try {
        const hidden = await repository.hide({ tenantId, clientId });
        if (!hidden) {
          return { ok: false, code: "missing_client" };
        }

        return { ok: true };
      } catch {
        return { ok: false, code: "client_update_failed" };
      }
    },
  };
}

async function requireUpdateCapability(
  capabilityChecker: ClientCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string
): Promise<MutateClientOutcome> {
  try {
    await requireActorCapability(
      capabilityChecker,
      session,
      tenantId,
      CLIENTS_UPDATE_CAPABILITY
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
  capabilityChecker: ClientCatalogServiceDependencies["capabilityChecker"],
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
  if (!tenantId) {
    return "";
  }

  return tenantId.trim();
}

function containsTenantOverride(input: unknown): boolean {
  const candidate = input as Record<string, unknown>;

  return (
    Object.prototype.hasOwnProperty.call(candidate, "tenant_id") ||
    Object.prototype.hasOwnProperty.call(candidate, "tenantId") ||
    Object.prototype.hasOwnProperty.call(candidate, "tenant")
  );
}

function normalizeClientInput(input: CreateClientInput): NormalizedClientInput {
  return {
    nombre: input.nombre.trim(),
    telefono: normalizeOptionalText(input.telefono),
    correo: normalizeEmail(input.correo),
    identificacion: normalizeOptionalText(input.identificacion),
    direccion: normalizeOptionalText(input.direccion),
  };
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeEmail(value?: string): string | undefined {
  return normalizeOptionalText(value)?.toLowerCase();
}

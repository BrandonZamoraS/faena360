import type {
  CreateFuelTypeInput,
  CreateFuelTypeOutcome,
  FuelTypeCatalogRepository,
  FuelTypeCatalogSummary,
  HideFuelTypeInput,
  MutateFuelTypeOutcome,
  UpdateFuelTypeInput,
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

export interface FuelTypeCatalogServiceDependencies {
  readonly repository: FuelTypeCatalogRepository;
  readonly capabilityChecker: {
    requireCapability(
      scope: CapabilityScope,
      capabilityCode: string
    ): Promise<unknown>;
  };
}

export interface FuelTypeCatalogService {
  listActiveFuelTypes(
    session: TenantSessionScope
  ): Promise<readonly FuelTypeCatalogSummary[]>;

  createFuelType(
    session: TenantSessionScope,
    input: CreateFuelTypeInput
  ): Promise<CreateFuelTypeOutcome>;

  updateFuelType(
    session: TenantSessionScope,
    input: UpdateFuelTypeInput
  ): Promise<MutateFuelTypeOutcome>;

  hideFuelType(
    session: TenantSessionScope,
    input: HideFuelTypeInput
  ): Promise<MutateFuelTypeOutcome>;
}

const FUEL_TYPES_READ_CAPABILITY = "fuel_types:read" as const;
const FUEL_TYPES_CREATE_CAPABILITY = "fuel_types:create" as const;
const FUEL_TYPES_UPDATE_CAPABILITY = "fuel_types:update" as const;

export function createFuelTypeCatalogService({
  capabilityChecker,
  repository,
}: FuelTypeCatalogServiceDependencies): FuelTypeCatalogService {
  return {
    async listActiveFuelTypes(session) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        throw new Error("Cannot list fuel types without tenant context.");
      }

      await capabilityChecker.requireCapability(
        { tenantId, userId: session.user_id },
        FUEL_TYPES_READ_CAPABILITY
      );

      return repository.listActive({ tenantId });
    },

    async createFuelType(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const nombre = input.nombre.trim();
      if (!nombre) {
        return { ok: false, code: "missing_nombre" };
      }

      try {
        await requireActorCapability(
          capabilityChecker,
          session,
          tenantId,
          FUEL_TYPES_CREATE_CAPABILITY
        );
      } catch (error) {
        if (error instanceof CapabilityDeniedError) {
          return { ok: false, code: "capability_denied" };
        }
        throw error;
      }

      try {
        const createdFuelType = await repository.create({
          tenantId,
          actorId: session.user_id,
          auditSource: "web",
          nombre,
        });
        return { ok: true, fuelTypeId: createdFuelType.id };
      } catch {
        return { ok: false, code: "fuel_type_create_failed" };
      }
    },

    async updateFuelType(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const fuelTypeId = input.fuelTypeId.trim();
      if (!fuelTypeId) {
        return { ok: false, code: "missing_fuel_type" };
      }

      const nombre = input.nombre.trim();
      if (!nombre) {
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
          fuelTypeId,
          actorId: session.user_id,
          auditSource: "web",
          nombre,
        });
        if (!updated) {
          return { ok: false, code: "missing_fuel_type" };
        }

        return { ok: true };
      } catch {
        return { ok: false, code: "fuel_type_update_failed" };
      }
    },

    async hideFuelType(session, input) {
      const tenantId = resolveTenantId(session.tenant_id);
      if (!tenantId) {
        return { ok: false, code: "missing_tenant" };
      }
      if (containsTenantOverride(input)) {
        return { ok: false, code: "capability_denied" };
      }

      const fuelTypeId = input.fuelTypeId.trim();
      if (!fuelTypeId) {
        return { ok: false, code: "missing_fuel_type" };
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
        const hidden = await repository.hide({
          tenantId,
          fuelTypeId,
          actorId: session.user_id,
          auditSource: "web",
        });
        if (!hidden) {
          return { ok: false, code: "missing_fuel_type" };
        }

        return { ok: true };
      } catch {
        return { ok: false, code: "fuel_type_update_failed" };
      }
    },
  };
}

async function requireUpdateCapability(
  capabilityChecker: FuelTypeCatalogServiceDependencies["capabilityChecker"],
  session: TenantSessionScope,
  tenantId: string
): Promise<MutateFuelTypeOutcome> {
  try {
    await requireActorCapability(
      capabilityChecker,
      session,
      tenantId,
      FUEL_TYPES_UPDATE_CAPABILITY
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
  capabilityChecker: FuelTypeCatalogServiceDependencies["capabilityChecker"],
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

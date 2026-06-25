import {
  CapabilityDeniedError,
  createEffectiveCapabilitiesResolver,
  type EffectiveCapabilitiesRepository,
  type UserCapabilityOverrideInput,
} from "../auth/effective-capabilities";
import {
  SYSTEM_VALIDATION_CONFIG_DEFAULTS,
  SUPPORTED_VALIDATION_FIELD_TYPES,
  isValidationConfigType,
  type ValidationConfigDefinition,
  type ValidationConfigResponse,
  type ValidationConfigSource,
  type ValidationConfigType,
  type ValidationFieldDefinition,
  type ValidationFieldType,
} from "./defaults";

export type GetValidationConfigErrorCode =
  | "TIPO_INVALIDO"
  | "TENANT_INVALIDO"
  | "PERMISO_DENEGADO"
  | "CONFIG_INVALIDA";

export interface ValidationConfigRepository extends EffectiveCapabilitiesRepository {
  getTenantUserContext(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<{
    readonly tenantId: string;
    readonly userId: string;
    readonly tenantStatus: string;
    readonly userStatus: string;
  } | null>;
  getTenantOverride(input: {
    readonly tenantId: string;
    readonly tipo: ValidationConfigType;
  }): Promise<unknown | null>;
}

export interface GetValidationConfigInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly tipo: string;
  readonly requiredCapability?: string;
}

export type GetValidationConfigOutcome =
  | { readonly ok: true; readonly config: ValidationConfigResponse }
  | {
      readonly ok: false;
      readonly errorCode: GetValidationConfigErrorCode;
    };

export interface ValidationConfigService {
  getConfig(
    input: GetValidationConfigInput
  ): Promise<GetValidationConfigOutcome>;
}

const DEFAULT_REQUIRED_CAPABILITY = "whatsapp.channel.access";

export class GetValidationConfigServiceImpl implements ValidationConfigService {
  private readonly capabilityResolver: ReturnType<
    typeof createEffectiveCapabilitiesResolver
  >;

  constructor(private readonly repository: ValidationConfigRepository) {
    this.capabilityResolver = createEffectiveCapabilitiesResolver({
      repository,
    });
  }

  async getConfig(
    input: GetValidationConfigInput
  ): Promise<GetValidationConfigOutcome> {
    const tipo = normalizeValidationConfigType(input.tipo);
    if (!tipo) {
      return { ok: false, errorCode: "TIPO_INVALIDO" };
    }

    const tenantId = normalizeIdentifier(input.tenantId);
    const userId = normalizeIdentifier(input.userId);
    if (!tenantId || !userId) {
      return { ok: false, errorCode: "TENANT_INVALIDO" };
    }

    const context = await this.repository.getTenantUserContext({
      tenantId,
      userId,
    });
    if (
      !context ||
      context.tenantStatus !== "active" ||
      context.userStatus !== "active"
    ) {
      return { ok: false, errorCode: "TENANT_INVALIDO" };
    }

    try {
      await this.capabilityResolver.requireCapability(
        { tenantId, userId },
        input.requiredCapability ?? DEFAULT_REQUIRED_CAPABILITY
      );
    } catch (error) {
      if (error instanceof CapabilityDeniedError) {
        return { ok: false, errorCode: "PERMISO_DENEGADO" };
      }
      throw error;
    }

    const override = await this.repository.getTenantOverride({
      tenantId,
      tipo,
    });

    try {
      const effective = resolveEffectiveValidationConfig(tipo, override);
      return {
        ok: true,
        config: {
          tipo,
          tenantId,
          source: resolveValidationConfigSource(override),
          campos: effective.campos,
        },
      };
    } catch {
      return { ok: false, errorCode: "CONFIG_INVALIDA" };
    }
  }
}

type ValidationConfigOverride = {
  readonly campos?: Record<string, ValidationFieldOverride>;
};

type ValidationFieldOverride = {
  readonly obligatorio?: boolean;
  readonly tipo?: ValidationFieldType;
};

export function resolveEffectiveValidationConfig(
  tipo: ValidationConfigType,
  override: unknown | null
): ValidationConfigDefinition {
  const base = cloneValidationConfig(SYSTEM_VALIDATION_CONFIG_DEFAULTS[tipo]);
  if (override == null) {
    return base;
  }

  const parsedOverride = parseValidationConfigOverride(override, tipo);
  if (!parsedOverride.campos) {
    return base;
  }

  const mergedCampos: Record<string, ValidationFieldDefinition> = {
    ...base.campos,
  };

  for (const [fieldName, fieldOverride] of Object.entries(
    parsedOverride.campos
  )) {
    const currentField = base.campos[fieldName];
    if (!currentField) {
      throw new Error(`Unknown validation field override: ${fieldName}`);
    }

    mergedCampos[fieldName] = {
      obligatorio: fieldOverride.obligatorio ?? currentField.obligatorio,
      tipo: fieldOverride.tipo ?? currentField.tipo,
    };
  }

  return { campos: mergedCampos };
}

function cloneValidationConfig(
  definition: ValidationConfigDefinition
): ValidationConfigDefinition {
  return {
    campos: Object.fromEntries(
      Object.entries(definition.campos).map(([fieldName, fieldDefinition]) => [
        fieldName,
        { ...fieldDefinition },
      ])
    ),
  };
}

function normalizeValidationConfigType(
  value: string
): ValidationConfigType | null {
  const normalized = value.trim();
  return normalized && isValidationConfigType(normalized) ? normalized : null;
}

function normalizeIdentifier(value: string): string | null {
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function resolveValidationConfigSource(
  override: unknown | null
): ValidationConfigSource {
  return override == null ? "system_default" : "tenant_override";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseValidationConfigOverride(
  input: unknown,
  tipo: ValidationConfigType
): ValidationConfigOverride {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      `Validation config override for ${tipo} must be an object.`
    );
  }

  const candidate = input as Record<string, unknown>;
  const allowedKeys = new Set(["campos"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported validation config override key: ${key}`);
    }
  }

  if (candidate.campos === undefined) {
    return {};
  }

  if (
    !candidate.campos ||
    typeof candidate.campos !== "object" ||
    Array.isArray(candidate.campos)
  ) {
    throw new Error(
      `Validation config override campos for ${tipo} must be an object.`
    );
  }

  const campos = Object.fromEntries(
    Object.entries(candidate.campos as Record<string, unknown>).map(
      ([fieldName, fieldValue]) => [
        fieldName,
        parseValidationFieldOverride(fieldName, fieldValue),
      ]
    )
  );

  return { campos };
}

function parseValidationFieldOverride(
  fieldName: string,
  input: unknown
): ValidationFieldOverride {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      `Validation config field override for ${fieldName} must be an object.`
    );
  }

  const candidate = input as Record<string, unknown>;
  const allowedKeys = new Set(["obligatorio", "tipo"]);
  for (const key of Object.keys(candidate)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported validation field override key: ${key}`);
    }
  }

  if (
    candidate.obligatorio !== undefined &&
    typeof candidate.obligatorio !== "boolean"
  ) {
    throw new Error(
      `Validation config override obligatorio for ${fieldName} must be boolean.`
    );
  }

  if (
    candidate.tipo !== undefined &&
    !SUPPORTED_VALIDATION_FIELD_TYPES.includes(
      candidate.tipo as ValidationFieldType
    )
  ) {
    throw new Error(
      `Validation config override tipo for ${fieldName} is invalid.`
    );
  }

  return {
    obligatorio: candidate.obligatorio as boolean | undefined,
    tipo: candidate.tipo as ValidationFieldType | undefined,
  };
}

export type { UserCapabilityOverrideInput };

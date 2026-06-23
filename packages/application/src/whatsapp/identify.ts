import { applyCapabilityOverrides, type UserCapabilityOverride } from "../auth";

const OPERATIONAL_ROLE_NAMES = new Set(["operador", "mantenimiento", "repartidor_de_combustible"]);

export type WhatsappIdentifyErrorCode =
  | "USUARIO_NO_REGISTRADO"
  | "USUARIO_INACTIVO"
  | "TENANT_INVALIDO"
  | "ROL_NO_WHATSAPP"
  | "PERMISO_DENEGADO";

export interface WhatsappIdentifyInput {
  readonly phone: string;
  readonly requiredCapability: string;
}

export interface WhatsappIdentityRole {
  readonly roleId: string;
  readonly roleName: string;
  readonly isWebAccess: boolean;
}

export interface WhatsappIdentityRecord {
  readonly userId: string;
  readonly userName: string;
  readonly tenantId: string;
  readonly userStatus: "active" | "inactive";
  readonly tenantStatus: string;
}

export interface WhatsappIdentityRepository {
  findByNormalizedPhone(input: { readonly phone: string }): Promise<WhatsappIdentityRecord | null>;
  listRoleAssignments(input: { readonly tenantId: string; readonly userId: string }): Promise<readonly WhatsappIdentityRole[]>;
  listCapabilitiesForRoles(input: { readonly tenantId: string; readonly roleIds: readonly string[] }): Promise<readonly string[]>;
  listUserCapabilityOverrides(input: { readonly tenantId: string; readonly userId: string }): Promise<readonly UserCapabilityOverride[]>;
}

export type WhatsappIdentifyOutcome =
  | {
      readonly ok: true;
      readonly user: {
        readonly userId: string;
        readonly userName: string;
        readonly tenantId: string;
        readonly roles: readonly string[];
        readonly capabilities: readonly string[];
      };
    }
  | { readonly ok: false; readonly errorCode: WhatsappIdentifyErrorCode };

export interface WhatsappIdentifyService {
  identify(input: WhatsappIdentifyInput): Promise<WhatsappIdentifyOutcome>;
}

export class WhatsappIdentifyServiceImpl implements WhatsappIdentifyService {
  constructor(private readonly repository: WhatsappIdentityRepository) {}

  async identify(input: WhatsappIdentifyInput): Promise<WhatsappIdentifyOutcome> {
    const phone = normalizePhone(input.phone);
    if (!phone) return { ok: false, errorCode: "USUARIO_NO_REGISTRADO" };

    const record = await this.repository.findByNormalizedPhone({ phone });
    if (!record) return { ok: false, errorCode: "USUARIO_NO_REGISTRADO" };
    if (record.userStatus !== "active") return { ok: false, errorCode: "USUARIO_INACTIVO" };
    if (record.tenantStatus !== "active") return { ok: false, errorCode: "TENANT_INVALIDO" };

    const roles = await this.repository.listRoleAssignments({ tenantId: record.tenantId, userId: record.userId });
    const operationalRoles = roles.filter((role) => !role.isWebAccess && OPERATIONAL_ROLE_NAMES.has(role.roleName));
    if (operationalRoles.length === 0) return { ok: false, errorCode: "ROL_NO_WHATSAPP" };

    const capabilities = applyCapabilityOverrides(
      await this.repository.listCapabilitiesForRoles({ tenantId: record.tenantId, roleIds: operationalRoles.map((role) => role.roleId) }),
      await this.repository.listUserCapabilityOverrides({ tenantId: record.tenantId, userId: record.userId })
    );
    if (!capabilities.has(input.requiredCapability)) return { ok: false, errorCode: "PERMISO_DENEGADO" };

    return {
      ok: true,
      user: {
        userId: record.userId,
        userName: record.userName,
        tenantId: record.tenantId,
        roles: operationalRoles.map((role) => role.roleName).sort(),
        capabilities: [...capabilities].sort(),
      },
    };
  }
}

function normalizePhone(phone: string): string | null {
  const normalized = phone.replace(/\D/g, "");
  return normalized || null;
}

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  AppSession,
  CreateMachineInput,
  UpdateMachineInput,
} from "@faena360/domain";
import {
  CapabilityDeniedError,
  createMachineCatalogService,
} from "@faena360/application";
import {
  SupabaseAppSessionRepository,
  SupabaseMachineCatalogRepository,
} from "@faena360/infrastructure";

import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";

export const MACHINE_CATALOG_PATH = "/dashboard/maquinas";
export const MACHINES_READ_CAPABILITY = "machines:read";
export const MACHINES_CREATE_CAPABILITY = "machines:create";
export const MACHINES_UPDATE_CAPABILITY = "machines:update";
export const MACHINES_CHANGE_STATUS_CAPABILITY = "machines:change_status";
export const FUEL_TYPES_READ_CAPABILITY = "fuel_types:read";

export function canAccessMachineCatalogPage(
  capabilities: readonly string[]
): boolean {
  return capabilities.includes(MACHINES_READ_CAPABILITY);
}

export function canRunMachineCatalogAction(
  capabilities: readonly string[],
  capability: string
): boolean {
  return (
    canAccessMachineCatalogPage(capabilities) &&
    capabilities.includes(capability)
  );
}

export async function listVisibleMachinesForSession(session: AppSession) {
  return buildMachineCatalogService(session).listVisibleMachines({
    tenant_id: session.tenant_id,
    user_id: session.user_id,
  });
}

export async function createMachineAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedMachineCatalogSession();
  guardMachineAction(session, MACHINES_CREATE_CAPABILITY);
  guardFuelTypeReadCapability(session);
  const result = await buildMachineCatalogService(session).createMachine(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    readCreateMachineInput(formData)
  );
  if (!result.ok) {
    throw new Error(result.code ?? "machine_create_failed");
  }
  revalidatePath(MACHINE_CATALOG_PATH);
}

export async function updateMachineAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedMachineCatalogSession();
  guardMachineAction(session, MACHINES_UPDATE_CAPABILITY);
  guardFuelTypeReadCapability(session);
  const result = await buildMachineCatalogService(session).updateMachine(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    readUpdateMachineInput(formData)
  );
  if (!result.ok) {
    throw new Error(result.code ?? "machine_update_failed");
  }
  revalidatePath(MACHINE_CATALOG_PATH);
}

export async function changeMachineStatusAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedMachineCatalogSession();
  guardMachineAction(session, MACHINES_CHANGE_STATUS_CAPABILITY);
  const result = await buildMachineCatalogService(session).changeMachineStatus(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    {
      machineId: getString(formData, "machineId"),
      estado: getString(formData, "estado"),
    }
  );
  if (!result.ok) {
    throw new Error(result.code ?? "machine_status_change_failed");
  }
  revalidatePath(MACHINE_CATALOG_PATH);
}

export async function hideMachineAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedMachineCatalogSession();
  guardMachineAction(session, MACHINES_CHANGE_STATUS_CAPABILITY);
  const result = await buildMachineCatalogService(session).hideMachine(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    { machineId: getString(formData, "machineId") }
  );
  if (!result.ok) {
    throw new Error(result.code ?? "machine_status_change_failed");
  }
  revalidatePath(MACHINE_CATALOG_PATH);
}

function buildMachineCatalogService(session: AppSession) {
  const serviceClient = createWebSupabaseServiceClient();
  return createMachineCatalogService({
    repository: new SupabaseMachineCatalogRepository(serviceClient),
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
  });
}

async function getAuthorizedMachineCatalogSession(): Promise<AppSession> {
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

function guardMachineAction(session: AppSession, capability: string) {
  if (!canRunMachineCatalogAction(session.effective_capabilities, capability)) {
    redirect("/dashboard");
  }
}

function guardFuelTypeReadCapability(session: AppSession) {
  if (!session.effective_capabilities.includes(FUEL_TYPES_READ_CAPABILITY)) {
    redirect("/dashboard");
  }
}

function readCreateMachineInput(formData: FormData): CreateMachineInput {
  return {
    codigo: getString(formData, "codigo"),
    placa: getNullableString(formData, "placa"),
    tipo: getString(formData, "tipo"),
    tipo_combustible_id: getString(formData, "tipo_combustible_id"),
    tamanio_tanque: getRequiredNumber(formData, "tamanio_tanque"),
    modo_medicion_combustible: getString(formData, "modo_medicion_combustible"),
    nivel_inicial_combustible: getOptionalNumber(
      formData,
      "nivel_inicial_combustible"
    ),
    capacidad_transporte_m3: getOptionalNumber(
      formData,
      "capacidad_transporte_m3"
    ),
    tarifa_sugerida: getOptionalNumber(formData, "tarifa_sugerida"),
  };
}

function readUpdateMachineInput(formData: FormData): UpdateMachineInput {
  return {
    machineId: getString(formData, "machineId"),
    ...readCreateMachineInput(formData),
  };
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getNullableString(formData: FormData, key: string): string | null {
  const value = getString(formData, key).trim();
  return value ? value : null;
}

function getRequiredNumber(formData: FormData, key: string): number {
  const value = Number(getString(formData, key));
  return value;
}

function getOptionalNumber(formData: FormData, key: string): number | null {
  const raw = getString(formData, key).trim();
  if (!raw) {
    return null;
  }
  return Number(raw);
}

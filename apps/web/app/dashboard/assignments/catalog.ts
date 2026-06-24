import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  AppSession,
  AssignmentEstado,
  CreateAssignmentInput,
} from "@faena360/domain";
import {
  CapabilityDeniedError,
  createMachineAssignmentService,
} from "@faena360/application";
import {
  SupabaseAppSessionRepository,
  SupabaseMachineAssignmentRepository,
} from "@faena360/infrastructure";

import {
  createServerStateSessionRefresher,
  requireWebAccess,
} from "../../../lib/auth/session";
import { createWebSupabaseServiceClient } from "../../../lib/supabase";

export const ASSIGNMENTS_PATH = "/dashboard/assignments";
export const ASSIGNMENTS_READ_CAPABILITY = "assignments:read";
export const ASSIGNMENTS_CREATE_CAPABILITY = "assignments:create";
export const ASSIGNMENTS_UPDATE_CAPABILITY = "assignments:update";

export function canAccessAssignmentsPage(
  capabilities: readonly string[],
): boolean {
  return capabilities.includes(ASSIGNMENTS_READ_CAPABILITY);
}

export function canRunAssignmentAction(
  capabilities: readonly string[],
  capability: string,
): boolean {
  return (
    canAccessAssignmentsPage(capabilities) &&
    capabilities.includes(capability)
  );
}

export async function listActiveAssignmentsForSession(session: AppSession) {
  return buildAssignmentService(session).listActiveAssignments({
    tenant_id: session.tenant_id,
    user_id: session.user_id,
  });
}

export async function createAssignmentAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedAssignmentsSession();
  guardAssignmentAction(session, ASSIGNMENTS_CREATE_CAPABILITY);
  const result = await buildAssignmentService(session).createAssignment(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    readCreateAssignmentInput(formData),
  );
  if (!result.ok) {
    throw new Error(result.code ?? "assignment_create_failed");
  }
  revalidatePath(ASSIGNMENTS_PATH);
}

export async function updateAssignmentStatusAction(formData: FormData) {
  "use server";
  const session = await getAuthorizedAssignmentsSession();
  guardAssignmentAction(session, ASSIGNMENTS_UPDATE_CAPABILITY);
  const result = await buildAssignmentService(session).updateAssignmentStatus(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    getString(formData, "assignmentId"),
    getString(formData, "estado") as AssignmentEstado,
  );
  if (!result.ok) {
    throw new Error(result.code ?? "assignment_update_failed");
  }
  revalidatePath(ASSIGNMENTS_PATH);
}

function buildAssignmentService(session: AppSession) {
  const serviceClient = createWebSupabaseServiceClient();
  return createMachineAssignmentService({
    repository: new SupabaseMachineAssignmentRepository(serviceClient),
    capabilityChecker: {
      async requireCapability(_scope, capabilityCode) {
        if (!session.effective_capabilities.includes(capabilityCode)) {
          throw new CapabilityDeniedError(
            session.user_id,
            session.tenant_id,
            capabilityCode,
          );
        }
      },
    },
  });
}

async function getAuthorizedAssignmentsSession(): Promise<AppSession> {
  const cookieStore = await cookies();
  const serviceClient = createWebSupabaseServiceClient();
  const repository = new SupabaseAppSessionRepository(serviceClient);
  const authResult = await requireWebAccess(cookieStore, {
    sessionRefresher: createServerStateSessionRefresher(repository),
  });
  if (!authResult.ok) {
    redirect("/dashboard");
  }
  if (
    !canAccessAssignmentsPage(authResult.session.effective_capabilities)
  ) {
    redirect("/dashboard");
  }
  return authResult.session;
}

function guardAssignmentAction(session: AppSession, capability: string) {
  if (
    !canRunAssignmentAction(session.effective_capabilities, capability)
  ) {
    redirect("/dashboard");
  }
}

function readCreateAssignmentInput(formData: FormData): CreateAssignmentInput {
  return {
    maquina_id: getString(formData, "maquina_id"),
    proyecto_id: getString(formData, "proyecto_id"),
    subproyecto_id: getNullableString(formData, "subproyecto_id"),
    operador_id: getString(formData, "operador_id"),
    tarifa_aplicada: getRequiredNumber(formData, "tarifa_aplicada"),
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

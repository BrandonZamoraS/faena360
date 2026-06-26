"use server";

import { revalidatePath } from "next/cache";
import type {
  AssignmentEstado,
  AssignmentHistoryEntry,
} from "@faena360/domain";
import {
  getAuthorizedAssignmentsSession,
  guardAssignmentAction,
  buildAssignmentService,
  readCreateAssignmentInput,
  getString,
  ASSIGNMENTS_PATH,
  ASSIGNMENTS_CREATE_CAPABILITY,
  ASSIGNMENTS_UPDATE_CAPABILITY,
} from "./catalog";

export async function listAssignmentHistoryAction(
  assignmentId: string
): Promise<readonly AssignmentHistoryEntry[]> {
  const session = await getAuthorizedAssignmentsSession();
  return buildAssignmentService(session).listAssignmentHistory(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    assignmentId
  );
}

export async function createAssignmentAction(formData: FormData) {
  const session = await getAuthorizedAssignmentsSession();
  guardAssignmentAction(session, ASSIGNMENTS_CREATE_CAPABILITY);
  const result = await buildAssignmentService(session).createAssignment(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    readCreateAssignmentInput(formData)
  );
  if (!result.ok) {
    throw new Error(result.code ?? "assignment_create_failed");
  }
  revalidatePath(ASSIGNMENTS_PATH);
}

export async function updateAssignmentStatusAction(formData: FormData) {
  const session = await getAuthorizedAssignmentsSession();
  guardAssignmentAction(session, ASSIGNMENTS_UPDATE_CAPABILITY);
  const result = await buildAssignmentService(session).updateAssignmentStatus(
    { tenant_id: session.tenant_id, user_id: session.user_id },
    getString(formData, "assignmentId"),
    getString(formData, "estado") as AssignmentEstado
  );
  if (!result.ok) {
    throw new Error(result.code ?? "assignment_update_failed");
  }
  revalidatePath(ASSIGNMENTS_PATH);
}

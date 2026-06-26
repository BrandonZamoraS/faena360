"use client";

import { useState } from "react";
import type { AssignmentHistoryEntry } from "@faena360/domain";
import { listAssignmentHistoryAction } from "./actions";

const ESTADO_LABELS: Record<string, string> = {
  activa: "Activa",
  retirada_del_proyecto: "Retirada del proyecto",
  cerrada_por_finalizacion: "Cerrada por finalización",
  bloqueada_por_conflicto: "Bloqueada por conflicto",
};

const ACTION_LABELS: Record<string, string> = {
  "asignacion.created": "Creación de asignación",
  "asignacion.updated": "Actualización de asignación",
  "asignacion.deleted": "Eliminación de asignación",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    estado: "Estado",
    tarifa_aplicada: "Tarifa",
    operador_id: "Operador",
    proyecto_id: "Proyecto",
    maquina_id: "Máquina",
    subproyecto_id: "Subproyecto",
    fecha_inicio: "Fecha inicio",
    fecha_fin: "Fecha fin",
  };
  return labels[field] ?? field;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    return ESTADO_LABELS[value] ?? value;
  }
  return String(value);
}

function renderChangedFields(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
) {
  if (!newValue) return <p className="text-sm text-[#798c82]">—</p>;

  const relevantFields = Object.keys(newValue).filter(
    (k) => k !== "id" && k !== "created_at" && k !== "updated_at"
  );

  if (relevantFields.length === 0)
    return <p className="text-sm text-[#798c82]">—</p>;

  return (
    <div className="mt-1 space-y-1">
      {relevantFields.map((field) => {
        const oldVal = oldValue?.[field];
        const newVal = newValue[field];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);

        return (
          <div key={field} className="text-sm">
            <span className="font-medium text-[#173b29]">
              {fieldLabel(field)}:{" "}
            </span>
            {changed ? (
              <span>
                <span className="text-[#8a1f16] line-through">
                  {formatCellValue(oldVal)}
                </span>
                {" → "}
                <span className="text-[#0f5132]">
                  {formatCellValue(newVal)}
                </span>
              </span>
            ) : (
              <span className="text-[#385346]">{formatCellValue(newVal)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function truncateUserId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}…`;
}

export function HistoryDrawerButton({
  assignmentId,
}: {
  readonly assignmentId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<readonly AssignmentHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDrawer = async () => {
    setIsOpen(true);
    setError(null);
    setIsLoading(true);
    try {
      const result = await listAssignmentHistoryAction(assignmentId);
      setEntries(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al cargar el historial."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const closeDrawer = () => setIsOpen(false);

  return (
    <>
      <button
        className="rounded-full bg-[#e8f7ff] px-3 py-1 text-xs font-semibold text-[#005f8a] transition-colors hover:bg-[#d0edff]"
        onClick={openDrawer}
        type="button"
      >
        Historial
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={closeDrawer}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeDrawer();
            }}
          />
          {/* drawer panel */}
          <div className="relative z-10 mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#102118]">
                Historial de cambios
              </h3>
              <button
                className="rounded-lg px-3 py-1 text-sm font-medium text-[#385346] transition-colors hover:bg-[#f5fbf7]"
                onClick={closeDrawer}
                type="button"
              >
                Cerrar
              </button>
            </div>

            {isLoading ? (
              <p className="py-8 text-center text-sm text-[#798c82]">
                Cargando historial…
              </p>
            ) : error ? (
              <div className="rounded-xl border border-[#f5d0d0] bg-[#fff1f0] p-4 text-sm text-[#8a1f16]">
                {error}
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#b8d8c2] bg-white/80 p-6 text-center">
                <p className="text-sm font-semibold text-[#102118]">
                  Sin cambios registrados.
                </p>
              </div>
            ) : (
              <div className="space-y-0 border-l-2 border-[#dcebe1] pl-5">
                {entries.map((entry, idx) => (
                  <div key={idx} className="relative pb-5 last:pb-0">
                    {/* timeline dot */}
                    <div className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-[#0f5132] bg-white" />
                    <p className="text-xs text-[#798c82]">
                      {formatTimestamp(entry.occurred_at)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[#102118]">
                      {formatAction(entry.action)}
                    </p>
                    {entry.actor_user_id ? (
                      <p className="text-xs text-[#798c82]">
                        Usuario: {truncateUserId(entry.actor_user_id)}
                      </p>
                    ) : null}
                    <p className="text-xs text-[#798c82]">
                      Fuente: {entry.source}
                    </p>
                    {renderChangedFields(entry.old_value, entry.new_value)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

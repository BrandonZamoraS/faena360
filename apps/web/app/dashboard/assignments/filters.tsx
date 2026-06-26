export interface FilterOption {
  id: string;
  label: string;
}

export function AssignmentFilters({
  proyectos,
  maquinas,
  currentProyecto,
  currentMaquina,
}: {
  readonly proyectos: readonly FilterOption[];
  readonly maquinas: readonly FilterOption[];
  readonly currentProyecto: string;
  readonly currentMaquina: string;
}) {
  return (
    <>
      <form
        id="assignment-filters-form"
        method="get"
        action="/dashboard/assignments"
        className="flex flex-wrap gap-4"
      >
        <label className="space-y-2 text-sm font-medium">
          <span>Proyecto</span>
          <select
            className="login-input min-w-[220px]"
            name="proyecto_id"
            defaultValue={currentProyecto}
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          <span>Máquina</span>
          <select
            className="login-input min-w-[220px]"
            name="maquina_id"
            defaultValue={currentMaquina}
          >
            <option value="">Todas las máquinas</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var form = document.getElementById('assignment-filters-form');
              if (!form) return;
              form.querySelectorAll('select').forEach(function(sel) {
                sel.addEventListener('change', function() { form.submit(); });
              });
            })();
          `,
        }}
      />
    </>
  );
}

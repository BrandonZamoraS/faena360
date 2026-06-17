export type ClienteEstado = "activo" | "oculto";

export interface ClientCatalogSummary {
  readonly id: string;
  readonly tenant_id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly correo: string | null;
  readonly identificacion: string | null;
  readonly direccion: string | null;
  readonly estado: ClienteEstado;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateClientInput {
  readonly nombre: string;
  readonly telefono?: string;
  readonly correo?: string;
  readonly identificacion?: string;
  readonly direccion?: string;
}

export interface UpdateClientInput extends CreateClientInput {
  readonly clientId: string;
}

export interface HideClientInput {
  readonly clientId: string;
}

export type ClientCatalogErrorCode =
  | "missing_tenant"
  | "missing_client"
  | "missing_nombre"
  | "capability_denied"
  | "client_create_failed"
  | "client_update_failed";

export interface CreateClientOutcome {
  readonly ok: boolean;
  readonly clientId?: string;
  readonly code?: ClientCatalogErrorCode;
}

export interface MutateClientOutcome {
  readonly ok: boolean;
  readonly code?: ClientCatalogErrorCode;
}

export interface ClientCatalogRepository {
  listActive(input: {
    readonly tenantId: string;
  }): Promise<readonly ClientCatalogSummary[]>;

  create(input: {
    readonly tenantId: string;
    readonly nombre: string;
    readonly telefono?: string;
    readonly correo?: string;
    readonly identificacion?: string;
    readonly direccion?: string;
  }): Promise<{ readonly id: string }>;

  update(input: {
    readonly tenantId: string;
    readonly clientId: string;
    readonly nombre: string;
    readonly telefono?: string;
    readonly correo?: string;
    readonly identificacion?: string;
    readonly direccion?: string;
  }): Promise<boolean>;

  hide(input: {
    readonly tenantId: string;
    readonly clientId: string;
  }): Promise<boolean>;
}

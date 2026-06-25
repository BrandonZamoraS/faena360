export const SUPPORTED_VALIDATION_CONFIG_TYPES = [
  "inicio_jornada",
  "cierre_jornada",
  "gasto",
  "compra_combustible",
  "carga_combustible",
  "mantenimiento",
] as const;

export type ValidationConfigType =
  (typeof SUPPORTED_VALIDATION_CONFIG_TYPES)[number];

export const SUPPORTED_VALIDATION_FIELD_TYPES = [
  "uuid",
  "string",
  "number",
  "boolean",
  "image",
  "selection",
  "array",
] as const;

export type ValidationFieldType =
  (typeof SUPPORTED_VALIDATION_FIELD_TYPES)[number];

export interface ValidationFieldDefinition {
  readonly obligatorio: boolean;
  readonly tipo: ValidationFieldType;
}

export interface ValidationConfigDefinition {
  readonly campos: Readonly<Record<string, ValidationFieldDefinition>>;
}

export type ValidationConfigSource = "system_default" | "tenant_override";

export type ValidationConfigResponse = {
  readonly tipo: ValidationConfigType;
  readonly tenantId: string;
  readonly source: ValidationConfigSource;
  readonly campos: Record<string, ValidationFieldDefinition>;
};

export const SYSTEM_VALIDATION_CONFIG_DEFAULTS: Record<
  ValidationConfigType,
  ValidationConfigDefinition
> = {
  inicio_jornada: {
    campos: {
      maquinaId: { obligatorio: true, tipo: "uuid" },
      horometroInicial: { obligatorio: true, tipo: "number" },
      fotoHorometro: { obligatorio: false, tipo: "image" },
      combustibleInicial: { obligatorio: false, tipo: "number" },
      subproyectoId: { obligatorio: false, tipo: "uuid" },
    },
  },
  cierre_jornada: {
    campos: {
      maquinaId: { obligatorio: true, tipo: "uuid" },
      horometroFinal: { obligatorio: true, tipo: "number" },
      fotoHorometroFinal: { obligatorio: false, tipo: "image" },
      combustibleFinal: { obligatorio: false, tipo: "number" },
      boletaTrabajo: { obligatorio: false, tipo: "image" },
    },
  },
  gasto: {
    campos: {
      categoriaId: { obligatorio: true, tipo: "uuid" },
      monto: { obligatorio: true, tipo: "number" },
      descripcion: { obligatorio: false, tipo: "string" },
      maquinaId: { obligatorio: false, tipo: "uuid" },
      proyectoId: { obligatorio: false, tipo: "uuid" },
      subproyectoId: { obligatorio: false, tipo: "uuid" },
      fotoComprobante: { obligatorio: false, tipo: "image" },
    },
  },
  compra_combustible: {
    campos: {
      tipoCombustibleId: { obligatorio: true, tipo: "uuid" },
      cantidadComprada: { obligatorio: true, tipo: "number" },
      costoTotal: { obligatorio: true, tipo: "number" },
      precioUnitario: { obligatorio: false, tipo: "number" },
      facturaCompra: { obligatorio: false, tipo: "image" },
      destinos: { obligatorio: true, tipo: "array" },
    },
  },
  carga_combustible: {
    campos: {
      maquinaId: { obligatorio: true, tipo: "uuid" },
      almacenId: { obligatorio: true, tipo: "uuid" },
      cantidad: { obligatorio: true, tipo: "number" },
    },
  },
  mantenimiento: {
    campos: {
      tipoMantenimiento: { obligatorio: true, tipo: "selection" },
      maquinaId: { obligatorio: true, tipo: "uuid" },
      descripcion: { obligatorio: true, tipo: "string" },
      fotos: { obligatorio: false, tipo: "array" },
      costo: { obligatorio: false, tipo: "number" },
      quedoFuncionando: { obligatorio: true, tipo: "boolean" },
    },
  },
};

export function isValidationConfigType(
  value: string
): value is ValidationConfigType {
  return SUPPORTED_VALIDATION_CONFIG_TYPES.includes(
    value as ValidationConfigType
  );
}

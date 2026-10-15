// Sub-servicios de fábrica de cada servicio. Se siembran en
// `servicio_requerido.options[].children` solo cuando la opción todavía no
// tiene `children` definido (ver conSubserviciosPorDefecto en
// ventas-clientes.service.ts) — así Ventas puede renombrar/quitar/agregar
// después sin que se los vuelvan a pisar. También siembran el catálogo de
// servicios de los contratos (ventas-servicios.util.ts).
//
// Vive en su propio archivo (y se re-exporta desde ventas-clientes.service.ts)
// para que las utilidades de servicios y oportunidades puedan usarlo sin
// importar el servicio de clientes completo.
export const DEFAULT_SUBSERVICIOS: Record<
  string,
  { key: string; label: string }[]
> = {
  SEGURIDAD_FISICA: [
    { key: 'AGENTES_DE_SEGURIDAD', label: 'Agentes de Seguridad' },
    {
      key: 'CUSTODIA_DE_MERCADERIA_EN_MOVIMIENTO',
      label: 'Custodia de Mercadería en Movimiento',
    },
    { key: 'SEGURIDAD_VIP', label: 'Seguridad VIP' },
    { key: 'SEGURIDAD_PARA_EVENTOS', label: 'Seguridad para Eventos' },
  ],
  MONITOREO: [
    { key: 'MONITOREO_DE_CAMARAS', label: 'Monitoreo de Cámaras' },
    { key: 'MONITOREO_DE_VEHICULOS', label: 'Monitoreo de Vehículos' },
    { key: 'MONITOREO_DE_ALARMAS', label: 'Monitoreo de Alarmas' },
    { key: 'MONITOREO_DE_PERSONAL', label: 'Monitoreo de Personal' },
  ],
  SOLUCIONES_TECNOLOGICAS: [
    { key: 'CABLEADO_ESTRUCTURADO', label: 'Cableado Estructurado' },
    { key: 'CAMARAS_DE_SEGURIDAD_CON_IA', label: 'Cámaras de Seguridad con IA' },
    { key: 'CONTROL_DE_ACCESOS', label: 'Control de Accesos' },
    { key: 'DETECCION_DE_INCENDIOS', label: 'Detección de Incendios' },
    { key: 'CERCO_ELECTRICO', label: 'Cerco Eléctrico' },
  ],
};

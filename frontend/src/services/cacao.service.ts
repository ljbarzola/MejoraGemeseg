import { api } from './auth.service';

export const getSuppliers = () => api.get('/cacao/suppliers').then(r => r.data);
export const createSupplier = (data: any) => api.post('/cacao/suppliers', data).then(r => r.data);
export const updateSupplier = (id: number, data: any) => api.patch(`/cacao/suppliers/${id}`, data).then(r => r.data);
export const deleteSupplier = (id: number) => api.delete(`/cacao/suppliers/${id}`);

export const getClients = () => api.get('/cacao/clients').then(r => r.data);
export const createClient = (data: any) => api.post('/cacao/clients', data).then(r => r.data);
export const updateClient = (id: number, data: any) => api.patch(`/cacao/clients/${id}`, data).then(r => r.data);
export const deleteClient = (id: number) => api.delete(`/cacao/clients/${id}`);

export const getQualities = () => api.get('/cacao/qualities').then(r => r.data);
export const createQuality = (data: any) => api.post('/cacao/qualities', data).then(r => r.data);
export const updateQuality = (id: number, data: any) => api.patch(`/cacao/qualities/${id}`, data).then(r => r.data);
export const deleteQuality = (id: number) => api.delete(`/cacao/qualities/${id}`);

export const getReceptions = (params?: any) => api.get('/cacao/receptions', { params }).then(r => r.data);
export const createReception = (data: any) => api.post('/cacao/receptions', data).then(r => r.data);

export const getLots = (params?: any) => api.get('/cacao/lots', { params }).then(r => r.data);
export const getLotById = (id: number) => api.get(`/cacao/lots/${id}`).then(r => r.data);
export const getNextLotCode = () => api.get('/cacao/lots/next-code').then(r => r.data);

export const getSettlements = () => api.get('/cacao/settlements').then(r => r.data);
export const getNextSettlementId = () => api.get('/cacao/settlements/next-id').then(r => r.data);
export const createSettlement = (data: any) => api.post('/cacao/settlements', data).then(r => r.data);
export const getSettlement = (id: number) => api.get(`/cacao/settlements/${id}`).then(r => r.data);
export const getAvailableLots = (supplierId: number) => api.get('/cacao/settlements/available-lots', { params: { supplierId } }).then(r => r.data);
export const approveSettlement = (id: number) => api.post(`/cacao/settlements/${id}/approve`).then(r => r.data);
/** Aprueba varias liquidaciones de una vez; devuelve cuáles se aprobaron y cuáles no, con el motivo. */
export const approveSettlements = (ids: number[]): Promise<{ aprobadas: number[]; omitidas: { id: number; motivo: string }[] }> =>
  api.post('/cacao/settlements/approve-bulk', { ids }).then(r => r.data);
export const rejectSettlement = (id: number, reason: string) => api.post(`/cacao/settlements/${id}/reject`, { reason }).then(r => r.data);
export const cancelSettlement = (id: number, reason: string) => api.post(`/cacao/settlements/${id}/cancel`, { reason }).then(r => r.data);

export const getPriceFixings = () => api.get('/cacao/price-fixings').then(r => r.data);
export const createPriceFixing = (data: any) => api.post('/cacao/price-fixings', data).then(r => r.data);
export const fixPrice = (id: number, data: any) => api.patch(`/cacao/price-fixings/${id}`, data).then(r => r.data);

export const getKardex = (params?: any) => api.get('/cacao/kardex', { params }).then(r => r.data);
export const getKardexByLot = (lotId: number) => api.get(`/cacao/kardex/${lotId}`).then(r => r.data);

export const getShipments = () => api.get('/cacao/shipments').then(r => r.data);
export const getNextShipmentId = () => api.get('/cacao/shipments/next-id').then(r => r.data);
export const createShipment = (data: any) => api.post('/cacao/shipments', data).then(r => r.data);

export const getPayables = (params?: any) => api.get('/cacao/payables', { params }).then(r => r.data);
export const payPayable = (id: number, data: any) => api.post(`/cacao/payables/${id}/pay`, data).then(r => r.data);
// Pagos con autorización (solo si la empresa lo exige): solicitar → autorizar → pagar
export const getPaymentRequests = (status?: string) => api.get('/cacao/payables/requests', { params: status ? { status } : {} }).then(r => r.data);
export const createPaymentRequest = (payableId: number, data: any) => api.post(`/cacao/payables/${payableId}/requests`, data).then(r => r.data);
export const authorizePaymentRequest = (id: number) => api.post(`/cacao/payables/requests/${id}/authorize`).then(r => r.data);
export const rejectPaymentRequest = (id: number, reason: string) => api.post(`/cacao/payables/requests/${id}/reject`, { reason }).then(r => r.data);
export const cancelPaymentRequest = (id: number) => api.post(`/cacao/payables/requests/${id}/cancel`).then(r => r.data);
export const payPaymentRequest = (id: number) => api.post(`/cacao/payables/requests/${id}/pay`).then(r => r.data);
export const voidPayment = (paymentId: number, reason: string) => api.post(`/cacao/payables/payments/${paymentId}/void`, { reason }).then(r => r.data);

export const getReceivables = (params?: any) => api.get('/cacao/receivables', { params }).then(r => r.data);
export const receiveReceivable = (id: number, data: any) => api.post(`/cacao/receivables/${id}/receive`, data).then(r => r.data);
export const voidReceipt = (paymentId: number, reason: string) => api.post(`/cacao/receivables/payments/${paymentId}/void`, { reason }).then(r => r.data);

export const getDashboard = () => api.get('/cacao/dashboard').then(r => r.data);

// Unit config
export const getUnitConfig = () => api.get('/cacao/unit-config').then(r => r.data);
export const createUnitConfig = (data: any) => api.post('/cacao/unit-config', data).then(r => r.data);
export const updateUnitConfig = (id: number, data: any) => api.patch(`/cacao/unit-config/${id}`, data).then(r => r.data);
export const deleteUnitConfig = (id: number) => api.delete(`/cacao/unit-config/${id}`);

// Motivos de rechazo y anulación de la empresa. tipo: LIQUIDACION (rechazar o anular una liquidación)
// o PAGO (anular un pago o un cobro). `todos` incluye los desactivados (pantalla de Configuración).
export type TipoMotivo = 'LIQUIDACION' | 'PAGO' | 'RECEPCION' | 'ANULACION';
export const getCacaoMotivos = (tipo?: TipoMotivo, todos?: boolean) =>
  api.get('/cacao/motivos', { params: { ...(tipo ? { tipo } : {}), ...(todos ? { todos: 1 } : {}) } }).then(r => r.data);
export const createCacaoMotivo = (data: { tipo: TipoMotivo; nombre: string }) => api.post('/cacao/motivos', data).then(r => r.data);
export const updateCacaoMotivo = (id: number, data: { nombre?: string; activo?: boolean }) => api.patch(`/cacao/motivos/${id}`, data).then(r => r.data);
export const deleteCacaoMotivo = (id: number) => api.delete(`/cacao/motivos/${id}`);

// Ajustes de la empresa (plazos de pago y cobro)
export const getCacaoConfig = () => api.get('/cacao/configuracion').then(r => r.data);
export const updateCacaoConfig = (data: { plazoPagoDias?: number; plazoCobroDias?: number; precioIce?: number | null; pagosRequierenAutorizacion?: boolean }) => api.put('/cacao/configuracion', data).then(r => r.data);

// Cerrar una entrega sin liquidarla (con motivo) y volver a abrirla
export const closeReception = (id: number, reason: string) => api.post(`/cacao/receptions/${id}/close`, { reason }).then(r => r.data);
export const reopenReception = (id: number) => api.post(`/cacao/receptions/${id}/reopen`).then(r => r.data);

// Compras de un periodo para el dashboard: `desde` y `hasta` son días AAAA-MM-DD (ambos incluidos)
export const getDashboardCompras = (desde: string, hasta: string) =>
  api.get('/cacao/dashboard/compras', { params: { desde, hasta } }).then(r => r.data);

// Anular una recepción o un embarque mal registrados (solo administrador, con motivo)
export const voidReception = (id: number, reason: string) => api.post(`/cacao/receptions/${id}/void`, { reason }).then(r => r.data);
export const cancelShipment = (id: number, reason: string) => api.post(`/cacao/shipments/${id}/cancel`, { reason }).then(r => r.data);

// Puntos de acopio de la empresa (sucursales donde se recibe el cacao). `todos` incluye los desactivados.
export const getCacaoPuntos = (todos?: boolean) => api.get('/cacao/puntos', { params: todos ? { todos: 1 } : {} }).then(r => r.data);
export const createCacaoPunto = (data: { nombre: string; direccion?: string | null }) => api.post('/cacao/puntos', data).then(r => r.data);
export const updateCacaoPunto = (id: number, data: { nombre?: string; direccion?: string | null; activo?: boolean }) => api.patch(`/cacao/puntos/${id}`, data).then(r => r.data);
export const deleteCacaoPunto = (id: number) => api.delete(`/cacao/puntos/${id}`);

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
export const createSettlement = (data: any) => api.post('/cacao/settlements', data).then(r => r.data);

export const getPriceFixings = () => api.get('/cacao/price-fixings').then(r => r.data);
export const createPriceFixing = (data: any) => api.post('/cacao/price-fixings', data).then(r => r.data);
export const fixPrice = (id: number, data: any) => api.patch(`/cacao/price-fixings/${id}`, data).then(r => r.data);

export const getKardex = (params?: any) => api.get('/cacao/kardex', { params }).then(r => r.data);
export const getKardexByLot = (lotId: number) => api.get(`/cacao/kardex/${lotId}`).then(r => r.data);

export const getShipments = () => api.get('/cacao/shipments').then(r => r.data);
export const createShipment = (data: any) => api.post('/cacao/shipments', data).then(r => r.data);

export const getPayables = (params?: any) => api.get('/cacao/payables', { params }).then(r => r.data);
export const payPayable = (id: number, data: any) => api.post(`/cacao/payables/${id}/pay`, data).then(r => r.data);

export const getReceivables = (params?: any) => api.get('/cacao/receivables', { params }).then(r => r.data);
export const receiveReceivable = (id: number, data: any) => api.post(`/cacao/receivables/${id}/receive`, data).then(r => r.data);

export const getDashboard = () => api.get('/cacao/dashboard').then(r => r.data);

// Unit config
export const getUnitConfig = () => api.get('/cacao/unit-config').then(r => r.data);
export const createUnitConfig = (data: any) => api.post('/cacao/unit-config', data).then(r => r.data);
export const updateUnitConfig = (id: number, data: any) => api.patch(`/cacao/unit-config/${id}`, data).then(r => r.data);
export const deleteUnitConfig = (id: number) => api.delete(`/cacao/unit-config/${id}`);

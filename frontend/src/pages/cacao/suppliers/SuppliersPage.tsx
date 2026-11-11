import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import FormModal from '../../../components/common/FormModal';
import ErrorBanner from '../../../components/common/ErrorBanner';
import { apiErrorMessage, formatMoney } from '../utils';
import { Trash2, Pencil, Paperclip, Wallet } from 'lucide-react';
import { getUser } from '../../../services/auth.service';
import SupplierDocumentsModal from './SupplierDocumentsModal';
import SupplierAdvancesModal from './SupplierAdvancesModal';
import { useTablaCacao } from '../useTablaCacao';

const FORM_VACIO = {
  name: '', contact: '', phone: '', paymentTerms: '', bank: '',
  idType: '', idNumber: '', email: '', address: '',
  bankAccountType: '', bankAccountNumber: '', bankAccountHolder: '', rating: '',
};

const TIPOS_ID: Record<string, string> = { CEDULA: 'Cédula', RUC: 'RUC', PASAPORTE: 'Pasaporte', OTRO: 'Otro' };
const TIPOS_CUENTA: Record<string, string> = { AHORRO: 'Ahorros', CORRIENTE: 'Corriente' };

const estrellas = (n?: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—');

export default function SuppliersPage() {
  const puedeEditar = getUser()?.role === 'ADMIN';
  // Proveedor cuyos documentos se están viendo.
  const [conDocumentos, setConDocumentos] = useState<any | null>(null);
  // Proveedor cuyos anticipos se están viendo.
  const [conAnticipos, setConAnticipos] = useState<any | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<number | null>(null);
  // Un error al eliminar (p. ej. el proveedor ya tiene recepciones) se muestra sobre la lista.
  const [errorLista, setErrorLista] = useState('');

  const load = () => {
    setLoading(true);
    getSuppliers().then(setSuppliers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function resetForm() {
    setErrorLista('');
    setForm(FORM_VACIO);
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    // El servidor valida lo mismo, pero aquí el mensaje sale claro y sin ir y volver.
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError('El correo no es válido: revisa que tenga @ y un dominio'); return; }
    if (form.idNumber.trim() && !/^[A-Za-z0-9-]+$/.test(form.idNumber.trim())) { setError('La identificación solo admite letras, números y guion, sin espacios'); return; }
    if (form.bankAccountNumber.trim() && !/^[A-Za-z0-9-]+$/.test(form.bankAccountNumber.trim())) { setError('El número de cuenta solo admite letras, números y guion, sin espacios'); return; }
    setSaving(true);
    setError('');
    try {
      // Lo que se deja vacío se manda como «sin dato» para que también borre lo que había.
      const data = {
        ...form,
        idType: form.idType || null,
        bankAccountType: form.bankAccountType || null,
        rating: form.rating ? Number(form.rating) : null,
      };
      if (editingId) {
        await updateSupplier(editingId, data);
      } else {
        await createSupplier(data);
      }
      resetForm();
      load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo guardar el proveedor. Revisa los datos e inténtalo de nuevo.'));
    } finally { setSaving(false); }
  }

  function startEdit(s: any) {
    setErrorLista('');
    setForm({
      name: s.name, contact: s.contact || '', phone: s.phone || '', paymentTerms: s.paymentTerms || '', bank: s.bank || '',
      idType: s.idType || '', idNumber: s.idNumber || '', email: s.email || '', address: s.address || '',
      bankAccountType: s.bankAccountType || '', bankAccountNumber: s.bankAccountNumber || '', bankAccountHolder: s.bankAccountHolder || '',
      rating: s.rating ? String(s.rating) : '',
    });
    setEditingId(s.id);
    setError('');
    setShowForm(true);
  }

  function handleDelete(id: number) {
    setConfirmandoEliminar(id);
  }

  async function confirmarEliminar() {
    const id = confirmandoEliminar;
    if (!id) return;
    setConfirmandoEliminar(null);
    setErrorLista('');
    try { await deleteSupplier(id); load(); } catch (err: any) {
      setErrorLista(apiErrorMessage(err, 'No se pudo eliminar el proveedor. Si ya tiene recepciones o liquidaciones, no se puede borrar.'));
    }
  }

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'proveedores',
    filas: suppliers,
    idFila: (s) => s.id,
    ordenInicial: 'nombre',
    principal: { key: 'nombre', filtro: { tipo: 'texto', getValue: (s) => s.name }, ancho: 220, label: 'Nombre', clase: 'tasks-table-title', orden: (s) => s.name, celda: (s) => s.name },
    columnas: [
      { key: 'contacto', filtro: { tipo: 'texto', getValue: (s) => s.contact }, ancho: 160, label: 'Contacto', orden: (s) => s.contact, celda: (s) => s.contact || '—' },
      { key: 'telefono', filtro: { tipo: 'texto', getValue: (s) => s.phone }, ancho: 130, label: 'Teléfono', orden: (s) => s.phone, celda: (s) => s.phone || '—' },
      { key: 'condiciones', filtro: { tipo: 'valores', vacio: 'Sin condiciones', getValues: (s) => s.paymentTerms }, ancho: 160, label: 'Condiciones', orden: (s) => s.paymentTerms, celda: (s) => s.paymentTerms || '—' },
      { key: 'banco', filtro: { tipo: 'valores', vacio: 'Sin banco', getValues: (s) => s.bank }, ancho: 160, label: 'Banco', orden: (s) => s.bank, celda: (s) => s.bank || '—' },
      { key: 'identificacion', filtro: { tipo: 'texto', getValue: (s) => s.idNumber }, ancho: 160, label: 'Identificación', orden: (s) => s.idNumber, celda: (s) => (s.idNumber ? `${TIPOS_ID[s.idType] ? TIPOS_ID[s.idType] + ' ' : ''}${s.idNumber}` : '—') },
      { key: 'correo', filtro: { tipo: 'texto', getValue: (s) => s.email }, ancho: 190, label: 'Correo', orden: (s) => s.email, celda: (s) => s.email || '—', ocultaPorDefecto: true },
      { key: 'cuenta', filtro: { tipo: 'texto', getValue: (s) => s.bankAccountNumber }, ancho: 200, label: 'Cuenta bancaria', orden: (s) => s.bankAccountNumber, celda: (s) => (s.bankAccountNumber ? `${TIPOS_CUENTA[s.bankAccountType] ? TIPOS_CUENTA[s.bankAccountType] + ' ' : ''}${s.bankAccountNumber}` : '—'), ocultaPorDefecto: true },
      { key: 'calificacion', filtro: { tipo: 'valores', vacio: 'Sin calificar', getValues: (s) => (s.rating ? `${s.rating} ${s.rating === 1 ? 'estrella' : 'estrellas'}` : '') }, ancho: 130, label: 'Calificación', orden: (s) => s.rating, celda: (s) => <span title={s.rating ? `${s.rating} de 5` : 'Sin calificar'} style={{ color: '#d69e2e', letterSpacing: 1 }}>{estrellas(s.rating)}</span>, ocultaPorDefecto: true },
      { key: 'anticipos', ancho: 140, label: 'Anticipos', derecha: true, orden: (s) => s.advanceBalance ?? 0, celda: (s) => (s.advanceBalance > 0 ? <span title="Saldo de anticipos que aún no se descuenta en una liquidación" style={{ fontWeight: 600 }}>{formatMoney(s.advanceBalance)}</span> : '—') },
      { key: 'documentos', ancho: 120, label: 'Documentos', orden: (s) => s.documentCount ?? 0, celda: (s) => (s.documentCount ? `${s.documentCount} ${s.documentCount === 1 ? 'archivo' : 'archivos'}` : '—'), ocultaPorDefecto: true },
    ],
    acciones: (s) => (
      <div className="tools-actions-cell">
        <button className="btn-secondary icon-btn" onClick={() => setConAnticipos(s)} title={s.advanceBalance > 0 ? `Anticipos (saldo ${formatMoney(s.advanceBalance)})` : 'Anticipos'} aria-label="Anticipos"><Wallet size={14} /></button>
        <button className="btn-secondary icon-btn" onClick={() => setConDocumentos(s)} title={s.documentCount ? `Documentos (${s.documentCount})` : 'Documentos'} aria-label="Documentos"><Paperclip size={14} /></button>
        <button className="btn-secondary icon-btn" onClick={() => startEdit(s)} title="Editar" aria-label="Editar"><Pencil size={14} /></button>
        <button className="btn-secondary icon-btn" style={{ color: '#c53030' }} onClick={() => handleDelete(s.id)} title="Eliminar proveedor" aria-label="Eliminar proveedor"><Trash2 size={14} /></button>
      </div>
    ),
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Proveedores"
        description="Las personas y empresas a las que les compras cacao."
        actions={
          <>
            <button className="auth-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Nuevo proveedor</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">{buscador}</div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={limpiarBusqueda} disabled={!hayBusqueda} />
        </div>
      </div>

      <ErrorBanner mensaje={errorLista} />

      {showForm && (
        <FormModal
          title={editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
          descripcion="Quien te vende cacao. Solo el nombre es obligatorio; lo demás sirve para identificarlo y pagarle."
          submitLabel={editingId ? 'Guardar cambios' : 'Crear proveedor'}
          saving={saving}
          error={error}
          onClose={resetForm}
          onSubmit={handleSubmit}
          ancho={640}
        >
          <div className="form-group">
            <label htmlFor="prov-nombre">Nombre *</label>
            <input id="prov-nombre" type="text" maxLength={120} autoComplete="off" placeholder="Ej: Hacienda La Esperanza" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-idtipo">Tipo de identificación</label>
              <select id="prov-idtipo" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
                <option value="">Sin especificar</option>
                {Object.entries(TIPOS_ID).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="prov-idnum">Número de identificación</label>
              <input id="prov-idnum" type="text" maxLength={20} autoComplete="off" placeholder="Cédula, RUC o pasaporte" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
              <span style={{ fontSize: '11px', color: '#718096' }}>No se puede repetir entre proveedores.</span>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-contacto">Persona de contacto</label>
              <input id="prov-contacto" type="text" maxLength={120} autoComplete="off" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="prov-telefono">Teléfono</label>
              <input id="prov-telefono" type="tel" inputMode="tel" maxLength={40} autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-correo">Correo</label>
              <input id="prov-correo" type="email" maxLength={120} autoComplete="off" placeholder="nombre@correo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="prov-direccion">Dirección</label>
              <input id="prov-direccion" type="text" maxLength={200} autoComplete="off" placeholder="Finca, recinto o ciudad" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>

          <div className="form-section-title">Cómo se le paga</div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-condiciones">Condiciones de pago</label>
              <input id="prov-condiciones" type="text" maxLength={120} autoComplete="off" placeholder="Ej: 30 días" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="prov-banco">Banco</label>
              <input id="prov-banco" type="text" maxLength={120} autoComplete="off" placeholder="Ej: Banco del Austro" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prov-ctatipo">Tipo de cuenta</label>
              <select id="prov-ctatipo" value={form.bankAccountType} onChange={(e) => setForm({ ...form, bankAccountType: e.target.value })}>
                <option value="">Sin especificar</option>
                {Object.entries(TIPOS_CUENTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="prov-ctanum">Número de cuenta</label>
              <input id="prov-ctanum" type="text" inputMode="numeric" maxLength={30} autoComplete="off" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="prov-titular">Titular de la cuenta</label>
            <input id="prov-titular" type="text" maxLength={120} autoComplete="off" placeholder="A nombre de quién está la cuenta" value={form.bankAccountHolder} onChange={(e) => setForm({ ...form, bankAccountHolder: e.target.value })} />
          </div>

          <div className="form-section-title">Calificación</div>
          <div className="form-group">
            <label htmlFor="prov-calif">Qué tan bueno es como proveedor</label>
            <select id="prov-calif" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
              <option value="">Sin calificar</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{estrellas(n)} ({n} de 5)</option>)}
            </select>
          </div>
          {editingId && (
            <p style={{ margin: 0, fontSize: '12px', color: '#718096' }}>
              Los documentos del proveedor (cédula, RUC, certificados) se adjuntan con el clip <Paperclip size={12} style={{ verticalAlign: '-2px' }} /> de su fila.
            </p>
          )}
        </FormModal>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando proveedores...</div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">Todavía no tienes proveedores. Crea el primero con «+ Nuevo proveedor» para poder registrar sus entregas.</div>
        ) : (
          tabla
        )}
      </div>

      {conAnticipos && (
        <SupplierAdvancesModal
          supplierId={conAnticipos.id}
          supplierName={conAnticipos.name}
          puedeEditar={puedeEditar}
          onClose={() => setConAnticipos(null)}
          onChange={load}
        />
      )}

      {conDocumentos && (
        <SupplierDocumentsModal
          supplierId={conDocumentos.id}
          supplierName={conDocumentos.name}
          puedeEditar={puedeEditar}
          onClose={() => setConDocumentos(null)}
          onChange={load}
        />
      )}

      {confirmandoEliminar !== null && (
        <ConfirmDialog
          title="Eliminar proveedor"
          message={`¿Eliminar a «${suppliers.find((x) => x.id === confirmandoEliminar)?.name ?? 'este proveedor'}»? Solo se puede si no tiene recepciones ni liquidaciones.`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}

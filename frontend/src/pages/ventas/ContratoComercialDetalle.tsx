import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw, Trash2, FilePlus, Link2, Unlink, Ban, RotateCcw, MessageSquareWarning, Mail, Info, PackageCheck } from 'lucide-react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import EstadoContratoBadge from '../../components/ventas/EstadoContratoBadge';
import ContratoComercialModal from '../../components/ventas/ContratoComercialModal';
import MotivoCierreModal from '../../components/ventas/MotivoCierreModal';
import { useToast } from '../../contexts/ToastContext';
import { subPageTitle } from './contratoStyles';
import {
  getContratoComercial,
  deleteContratoComercial,
  desvincularDocumentoDeContrato,
  vincularDocumentoAContrato,
  cancelarContratoComercial,
  registrarCierreContrato,
  updateContratoComercial,
  MOTIVO_KIND_LABEL,
  GARANTIA_LABEL,
  getContracts,
  getServicios,
  type ContratoComercial,
  type SalesContract,
  type SalesServicio,
} from '../../services/ventas.service';
import { diaCorto } from '../../utils/contratoComercial';

const dinero = (v?: number | null) =>
  v == null ? 'No registrado' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORIGEN_MOTIVO: Record<string, string> = {
  CLIENTE: 'lo dijo el cliente',
  VENDEDOR: 'suposición del vendedor, no confirmada por el cliente',
};

const DOC_ESTADO: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: '#f59e0b' },
  GENERATING: { label: 'Generando', color: '#3b82f6' },
  READY: { label: 'Listo', color: '#10b981' },
  SENT: { label: 'Enviado', color: '#8b5cf6' },
  SIGNED: { label: 'Firmado', color: '#059669' },
  CANCELLED: { label: 'Cancelado', color: '#ef4444' },
};

const caja = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 } as const;
const etiqueta = { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 } as const;

// Detalle de un contrato comercial: datos, cadena de renovaciones y los
// documentos (Documentación) que cuelgan de él.
export default function ContratoComercialDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [contrato, setContrato] = useState<ContratoComercial | null>(null);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [docsCliente, setDocsCliente] = useState<SalesContract[]>([]);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<'editar' | 'renovar' | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [aDesvincular, setADesvincular] = useState<number | null>(null);
  const [motivoModal, setMotivoModal] = useState<'cancelar' | 'cierre' | null>(null);
  const [docParaVincular, setDocParaVincular] = useState('');
  const [mostrarAsociar, setMostrarAsociar] = useState(false);
  const [confirmarOtroDoc, setConfirmarOtroDoc] = useState(false);

  const cargar = async () => {
    try {
      const [c, ss] = await Promise.all([getContratoComercial(Number(id)), getServicios(true)]);
      setContrato(c);
      setServicios(ss);
      setError('');
      // Documentos del mismo cliente que se pueden colgar de este contrato.
      const docs: SalesContract[] = await getContracts();
      setDocsCliente(docs.filter((d) => d.salesClientId === c.salesClientId));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo cargar el contrato.');
    }
  };
  useEffect(() => { cargar(); }, [id]);

  if (error) {
    return (
      <div className="page-container">
        <button className="cacao-back-btn" onClick={() => navigate('/ventas/contratos')}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <p style={{ color: '#c33', marginTop: 16 }}>{error}</p>
      </div>
    );
  }
  if (!contrato) return <div className="page-container"><p style={{ color: '#888' }}>Cargando...</p></div>;

  const vinculados = new Set((contrato.documents || []).map((d) => d.contractId));
  const sinVincular = docsCliente.filter((d) => !vinculados.has(d.id));
  const titulo = contrato.title || `Contrato #${contrato.id}`;
  const producto = contrato.kind === 'PRODUCTO';
  const puedeRenovar = !producto && contrato.estado !== 'RENOVADO' && contrato.estado !== 'CANCELADO' && contrato.estado !== 'POR_INICIAR';
  const puedeCancelar = contrato.estado !== 'RENOVADO' && contrato.estado !== 'CANCELADO';
  const sinMotivoDeCierre =
    contrato.estado === 'VENCIDO' && !(contrato.motivos || []).some((m) => m.kind === 'CONTRATO_NO_RENOVADO');

  const accion = async (fn: () => Promise<ContratoComercial>, ok: string, falla: string) => {
    try {
      setContrato(await fn());
      showToast(ok, 'success');
      const docs: SalesContract[] = await getContracts();
      setDocsCliente(docs.filter((d) => d.salesClientId === contrato.salesClientId));
    } catch (err: any) {
      showToast(err?.response?.data?.message || falla, 'error');
    }
  };

  const accionesMenu: RowAction[] = [];
  if (puedeCancelar) {
    accionesMenu.push({
      label: producto ? 'Cancelar venta' : 'Cancelar contrato',
      icon: <Ban size={15} />,
      hint: producto ? 'La venta queda cancelada y se pide un motivo' : 'El contrato queda cancelado y se pide un motivo',
      onClick: () => setMotivoModal('cancelar'),
    });
  }
  if (contrato.estado === 'CANCELADO') {
    accionesMenu.push({
      label: 'Reactivar',
      icon: <RotateCcw size={15} />,
      onClick: () => { accion(() => updateContratoComercial(contrato.id, { status: producto ? 'POR_ENTREGAR' : 'ACTIVO' }), producto ? 'Venta reactivada' : 'Contrato reactivado', 'No se pudo reactivar'); },
    });
  }
  if (producto && contrato.estado === 'ENTREGADO') {
    accionesMenu.push({
      label: 'Volver a «Por entregar»',
      icon: <RotateCcw size={15} />,
      hint: 'Úsalo si lo marcaste como entregado por error',
      onClick: () => { accion(() => updateContratoComercial(contrato.id, { status: 'POR_ENTREGAR' }), 'Vuelve a «Por entregar»', 'No se pudo cambiar el estado'); },
    });
  }
  accionesMenu.push({
    label: producto ? 'Eliminar venta' : 'Eliminar contrato',
    icon: <Trash2 size={15} />,
    danger: true,
    hint: 'Los documentos generados no se borran',
    onClick: () => setConfirmarEliminar(true),
  });

  const porIniciar = contrato.estado === 'POR_INICIAR';
  const yaTieneDocs = (contrato.documents || []).length > 0;
  const irAGenerar = () =>
    navigate(`/ventas/documentacion/nuevo?clienteId=${contrato.salesClientId}&contratoId=${contrato.id}`);
  const primerDoc = contrato.documents?.[0];
  const nombrePrimerDoc = primerDoc ? (primerDoc.contract.contractNumber || `#${primerDoc.contractId}`) : '';

  const eliminar = async () => {
    setConfirmarEliminar(false);
    try {
      await deleteContratoComercial(contrato.id);
      showToast('Contrato eliminado. Sus documentos siguen en Documentación.', 'success');
      navigate('/ventas/contratos');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar el contrato', 'error');
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', flex: '1 1 320px', minWidth: 0 }}>
          <button className="cacao-back-btn" onClick={() => navigate('/ventas/contratos')}>
            <ArrowLeft size={16} strokeWidth={2.4} /> Volver
          </button>
          <h2 style={subPageTitle}>{titulo} — {contrato.salesClient.name}</h2>
          <EstadoContratoBadge estado={contrato.estado} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flex: '0 0 auto' }}>
          <button className="btn-secondary" onClick={() => setModo('editar')}><Pencil size={15} /> Editar</button>
          {producto ? (
            contrato.estado === 'POR_ENTREGAR' && (
              <button className="auth-btn" onClick={() => { accion(() => updateContratoComercial(contrato.id, { status: 'ENTREGADO' }), 'Marcado como entregado', 'No se pudo marcar como entregado'); }}>
                <PackageCheck size={15} /> Marcar como entregado
              </button>
            )
          ) : (
            <button className="btn-secondary" onClick={() => setModo('renovar')} disabled={!puedeRenovar}
              title={puedeRenovar ? undefined : contrato.estado === 'RENOVADO' ? 'Ya fue renovado' : contrato.estado === 'POR_INICIAR' ? 'Se puede renovar cuando el contrato empiece' : 'Un contrato cancelado no se renueva'}>
              <RefreshCw size={15} /> Renovar
            </button>
          )}
          <RowActionsMenu actions={accionesMenu} label="Más acciones del contrato" />
        </div>
      </div>

      {sinMotivoDeCierre && (
        <div style={{ background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MessageSquareWarning size={18} color="#b7791f" />
          <span style={{ flex: 1, fontSize: 13 }}>
            Este contrato venció sin renovarse y no se ha registrado por qué. Anotarlo ayuda a entender qué pasó con el cliente.
          </span>
          <button className="auth-btn" onClick={() => setMotivoModal('cierre')}>Registrar el motivo</button>
        </div>
      )}

      <div style={caja}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <div style={etiqueta}>Cliente</div>
            <div>{contrato.salesClient.name}</div>
          </div>
          {producto ? (
            <>
              <div>
                <div style={etiqueta}>Fecha de la venta</div>
                <div>{diaCorto(contrato.startDate)}</div>
              </div>
              <div>
                <div style={etiqueta}>Valor total</div>
                <div>{dinero(contrato.totalValue)}</div>
              </div>
              <div>
                <div style={etiqueta}>Entrega</div>
                <div>{contrato.deliveredAt ? `Entregado el ${diaCorto(contrato.deliveredAt)}` : 'Por entregar'}</div>
              </div>
              <div>
                <div style={etiqueta}>Garantía</div>
                <div>
                  {contrato.warrantyUntil
                    ? `Hasta ${diaCorto(contrato.warrantyUntil)}${contrato.garantia ? ` · ${GARANTIA_LABEL[contrato.garantia]}` : ''}`
                    : 'Sin garantía registrada'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={etiqueta}>Inicio</div>
                <div>{diaCorto(contrato.startDate)}</div>
              </div>
              <div>
                <div style={etiqueta}>Fin</div>
                <div>{contrato.endDate ? diaCorto(contrato.endDate) : 'Sin fecha de fin'}</div>
              </div>
              <div>
                <div style={etiqueta}>Valor mensual</div>
                <div>{dinero(contrato.monthlyValue)}</div>
              </div>
              <div>
                <div style={etiqueta}>Días de gracia</div>
                <div>{contrato.graceDays}</div>
              </div>
            </>
          )}
          {contrato.cancelledAt && (
            <div>
              <div style={etiqueta}>Cancelado el</div>
              <div>{diaCorto(contrato.cancelledAt)}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={etiqueta}>{producto ? 'Productos' : 'Servicios'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {contrato.services.map((s) => (
              <span key={s.id} className="status-badge" style={{ backgroundColor: '#eef2f7', color: '#334155' }}>
                {s.name}
              </span>
            ))}
          </div>
          {servicios.some((s) => !s.isActive && contrato.services.some((x) => x.id === s.id)) && (
            <p style={{ fontSize: 11, color: '#888', margin: '6px 0 0' }}>
              Algún servicio de este contrato ya está desactivado en el catálogo; se conserva aquí.
            </p>
          )}
        </div>

        {contrato.notes && (
          <div style={{ marginTop: 16 }}>
            <div style={etiqueta}>Notas</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{contrato.notes}</div>
          </div>
        )}

        {(contrato.motivos || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={etiqueta}>Motivos registrados</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {contrato.motivos!.map((m) => (
                <li key={m.id} style={{ marginBottom: 4 }}>
                  <strong>{MOTIVO_KIND_LABEL[m.kind]}:</strong> {m.reasonLabel}
                  {m.source ? ` (${ORIGEN_MOTIVO[m.source]})` : ' (sin información de quién lo dijo)'}
                  {m.comment ? ` — «${m.comment}»` : ''}
                  <span style={{ color: '#a0aec0' }}> · {diaCorto(m.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(contrato.renewedFrom || (contrato.renewals && contrato.renewals.length > 0)) && (
          <div style={{ marginTop: 16, fontSize: 13 }}>
            {contrato.renewedFrom && (
              <div>
                Renueva el contrato{' '}
                <a className="enlace-tabla" href={`/ventas/contratos/${contrato.renewedFrom.id}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/ventas/contratos/${contrato.renewedFrom!.id}`); }}>
                  {contrato.renewedFrom.title || `#${contrato.renewedFrom.id}`}
                </a>{' '}
                ({diaCorto(contrato.renewedFrom.startDate)} – {diaCorto(contrato.renewedFrom.endDate) || 'sin fin'})
              </div>
            )}
            {contrato.renewals?.map((r) => (
              <div key={r.id}>
                Renovado por{' '}
                <a className="enlace-tabla" href={`/ventas/contratos/${r.id}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/ventas/contratos/${r.id}`); }}>
                  {r.title || `#${r.id}`}
                </a>{' '}
                (desde {diaCorto(r.startDate)})
              </div>
            ))}
          </div>
        )}
      </div>

      {porIniciar && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#1e3a8a' }}>
          <Info size={18} color="#2563eb" style={{ flexShrink: 0 }} />
          <span>Este contrato empieza el {diaCorto(contrato.startDate)}. Puedes dejar listo su documento desde ahora.</span>
        </div>
      )}

      <div style={caja}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Documentos</h3>
          <div style={{ flex: 1 }} />
          <button
            className="btn-secondary"
            disabled
            title="Estamos probando el envío por correo; por ahora genera el archivo y envíalo desde Documentación"
          >
            <Mail size={15} /> Enviar a firma por correo · Próximamente
          </button>
          <button
            className="auth-btn"
            onClick={() => (porIniciar && yaTieneDocs ? setConfirmarOtroDoc(true) : irAGenerar())}
          >
            <FilePlus size={15} /> {porIniciar && yaTieneDocs ? 'Generar otro documento' : 'Generar documento'}
          </button>
        </div>

        {(contrato.documents || []).length === 0 ? (
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px' }}>
            Este contrato aún no tiene documentos. Genera uno desde una plantilla.
          </p>
        ) : (
          <div className="tasks-table-wrapper" style={{ marginBottom: 12 }}>
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Plantilla</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {contrato.documents!.map((d) => {
                  const est = DOC_ESTADO[d.contract.status] || { label: d.contract.status, color: '#888' };
                  return (
                    <tr key={d.contractId} style={{ cursor: 'pointer' }} onClick={() => navigate(`/ventas/documentacion/${d.contractId}`)}>
                      <td style={{ fontWeight: 600 }}>{d.contract.contractNumber || `#${d.contractId}`}</td>
                      <td>{d.contract.template?.name || '—'}</td>
                      <td>
                        <span className="status-badge" style={{ backgroundColor: est.color + '22', color: est.color }}>{est.label}</span>
                      </td>
                      <td>{new Date(d.contract.createdAt).toLocaleDateString('es-EC')}</td>
                      <td className="col-acciones col-acciones--ancha" onClick={(e) => e.stopPropagation()}>
                        <div className="acciones-iconos">
                          <button className="icon-btn" title="Quitar de este contrato" aria-label="Quitar de este contrato" onClick={() => setADesvincular(d.contractId)}>
                            <Unlink size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sinVincular.length > 0 && (
          !mostrarAsociar ? (
            <button type="button" className="enlace-tabla" onClick={() => setMostrarAsociar(true)}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, cursor: 'pointer' }}>
              Asociar un documento existente de este cliente
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 12, color: '#718096', margin: '0 0 8px' }}>
                Útil si ya generaste un documento de este cliente por separado y quieres que cuente como parte de este contrato.
              </p>
              <div className="filter-bar-fields">
                <select className="filter-select" value={docParaVincular} onChange={(e) => setDocParaVincular(e.target.value)}
                  aria-label="Documento del cliente para asociar">
                  <option value="">Elige un documento...</option>
                  {sinVincular.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.contractNumber || `#${d.id}`} · {d.template?.name || 'sin plantilla'} · {(DOC_ESTADO[d.status] || { label: d.status }).label}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary" disabled={!docParaVincular}
                  onClick={async () => {
                    await accion(() => vincularDocumentoAContrato(contrato.id, Number(docParaVincular)), 'Documento asociado', 'No se pudo asociar el documento');
                    setDocParaVincular('');
                    setMostrarAsociar(false);
                  }}>
                  <Link2 size={15} /> Asociar
                </button>
                <button className="btn-secondary" onClick={() => { setMostrarAsociar(false); setDocParaVincular(''); }}>Cancelar</button>
              </div>
            </div>
          )
        )}
      </div>

      {modo && (
        <ContratoComercialModal
          modo={modo}
          contrato={contrato}
          servicios={servicios}
          onClose={() => setModo(null)}
          onSaved={(c) => {
            const eraRenovar = modo === 'renovar';
            setModo(null);
            showToast(eraRenovar ? 'Contrato renovado' : producto ? 'Venta actualizada' : 'Contrato actualizado', 'success');
            if (eraRenovar) navigate(`/ventas/contratos/${c.id}`);
            else cargar();
          }}
        />
      )}

      {motivoModal === 'cancelar' && (
        <MotivoCierreModal
          kind="CONTRATO_CANCELADO"
          titulo={producto ? 'Cancelar venta' : 'Cancelar contrato'}
          descripcion={`${producto ? 'Venta' : 'Contrato'} de ${contrato.salesClient.name}`}
          contexto={producto
            ? 'La venta queda cancelada. Explicar por qué ayuda a entender qué pasó.'
            : 'El contrato queda cancelado desde hoy y el cliente deja de contar como vigente. Explicar por qué ayuda a entender qué pasó.'}
          confirmLabel={producto ? 'Cancelar venta' : 'Cancelar contrato'}
          onConfirm={async (motivo) => {
            setContrato(await cancelarContratoComercial(contrato.id, { motivo }));
            setMotivoModal(null);
            showToast(producto ? 'Venta cancelada' : 'Contrato cancelado', 'success');
          }}
          onCancel={() => setMotivoModal(null)}
        />
      )}

      {motivoModal === 'cierre' && (
        <MotivoCierreModal
          kind="CONTRATO_NO_RENOVADO"
          titulo="¿Por qué no se renovó?"
          descripcion={`Contrato de ${contrato.salesClient.name}, vencido el ${diaCorto(contrato.endDate)}`}
          confirmLabel="Guardar motivo"
          onConfirm={async (motivo) => {
            setContrato(await registrarCierreContrato(contrato.id, motivo));
            setMotivoModal(null);
            showToast('Motivo registrado', 'success');
          }}
          onCancel={() => setMotivoModal(null)}
        />
      )}

      {confirmarEliminar && (
        <ConfirmDialog
          title={producto ? 'Eliminar venta' : 'Eliminar contrato'}
          message={`¿Eliminar ${producto ? 'esta venta' : 'este contrato'}? Los documentos generados no se borran: siguen en Documentación.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={eliminar}
          onCancel={() => setConfirmarEliminar(false)}
        />
      )}

      {confirmarOtroDoc && (
        <ConfirmDialog
          title="Generar otro documento"
          message={`Este contrato ya tiene el documento ${nombrePrimerDoc}. ¿Generar otro?`}
          confirmLabel="Generar otro"
          onConfirm={() => { setConfirmarOtroDoc(false); irAGenerar(); }}
          onCancel={() => setConfirmarOtroDoc(false)}
        />
      )}

      {aDesvincular != null && (
        <ConfirmDialog
          title="Quitar documento"
          message="El documento deja de estar en este contrato pero no se borra: sigue en Documentación."
          confirmLabel="Quitar"
          onConfirm={() => {
            const cid = aDesvincular;
            setADesvincular(null);
            accion(() => desvincularDocumentoDeContrato(contrato.id, cid), 'Documento quitado del contrato', 'No se pudo quitar el documento');
          }}
          onCancel={() => setADesvincular(null)}
        />
      )}
    </div>
  );
}

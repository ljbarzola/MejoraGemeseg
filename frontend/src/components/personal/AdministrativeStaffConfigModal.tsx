import { useState, type ReactNode } from 'react';
import { X, Settings2, User, Briefcase, FileCog } from 'lucide-react';
import PersonalFieldsConfigModal from './PersonalFieldsConfigModal';
import DocumentosRequeridosModal from './DocumentosRequeridosModal';

type Tab = 'GENERALES' | 'LABORALES' | 'DOCUMENTOS';

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'GENERALES', label: 'Datos generales', icon: <User size={14} /> },
  { key: 'LABORALES', label: 'Datos laborales', icon: <Briefcase size={14} /> },
  { key: 'DOCUMENTOS', label: 'Documentos requeridos', icon: <FileCog size={14} /> },
];

/**
 * Configuración unificada de Personal Administrativo: antes eran dos
 * pantallas separadas (PersonalFieldsConfigModal para campos, agrupados por
 * categoría, y DocumentosRequeridosModal para documentos) — se combinan aquí
 * en pestañas para que RRHH configure todo desde un solo lugar. Cada pestaña
 * sigue siendo el mismo componente de siempre, en modo `embedded` (sin su
 * propio overlay/header), así que el comportamiento de guardar/editar/quitar
 * no cambia, solo dónde vive dentro de la pantalla.
 */
export default function AdministrativeStaffConfigModal({
  initialTab = 'GENERALES',
  onClose,
  onFieldsChanged,
}: {
  initialTab?: Tab;
  onClose: () => void;
  onFieldsChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={17} /> Configuración — Personal Administrativo
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', borderBottom: '1px solid #e2e8f0', paddingBottom: '2px' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', border: 'none', borderBottom: tab === t.key ? '2px solid var(--azul-oscuro)' : '2px solid transparent',
                  background: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                  color: tab === t.key ? 'var(--azul-oscuro)' : '#94a3b8',
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'GENERALES' && (
            <PersonalFieldsConfigModal
              embedded
              scope="PERSONAL_ADMIN"
              onlyCategory="PERSONAL"
              onClose={onClose}
              onChanged={onFieldsChanged}
            />
          )}
          {tab === 'LABORALES' && (
            <PersonalFieldsConfigModal
              embedded
              scope="PERSONAL_ADMIN"
              onlyCategory="LABORAL"
              onClose={onClose}
              onChanged={onFieldsChanged}
            />
          )}
          {tab === 'DOCUMENTOS' && (
            <DocumentosRequeridosModal embedded onClose={onClose} />
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

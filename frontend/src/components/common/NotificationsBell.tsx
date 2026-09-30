import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import {
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '../../services/notifications.service';

const POLL_MS = 60000;

function tiempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

// No hay WebSockets en el repo: el conteo de no leídas se refresca con un
// poll simple cada minuto, y la lista completa se pide solo al abrir el
// desplegable (evita pedirla de más).
export default function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshUnread = useCallback(() => {
    getUnreadNotificationsCount().then((r) => setUnread(r.count)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
    const id = setInterval(refreshUnread, POLL_MS);
    return () => clearInterval(id);
  }, [refreshUnread]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      getNotifications().then(setItems).finally(() => setLoading(false));
    }
  };

  const handleItemClick = async (n: AppNotification) => {
    if (!n.leida) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, leida: true } : i)));
        setUnread((c) => Math.max(0, c - 1));
      } catch { /* no bloquea la navegación si falla */ }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((i) => ({ ...i, leida: true })));
      setUnread(0);
    } catch { /* se reintenta en el proximo poll */ }
  };

  return (
    <div ref={containerRef} style={{ position: 'fixed', top: '16px', right: '24px', zIndex: 'var(--z-notif-btn)' }}>
      <button
        onClick={handleToggle}
        title="Notificaciones"
        style={{
          position: 'relative', width: '44px', height: '44px', borderRadius: '50%', border: 'none',
          background: 'var(--azul-oscuro)', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px', minWidth: '18px', height: '18px',
            borderRadius: '9px', background: '#c53030', color: 'white', fontSize: '0.68rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '52px', right: 0, width: '340px', maxHeight: '420px', overflowY: 'auto',
          background: 'white', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--azul-oscuro)' }}>Notificaciones</strong>
            {unread > 0 && (
              <button onClick={handleMarkAll} style={{ background: 'none', border: 'none', color: 'var(--azul-oscuro)', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>
                Marcar todas como leídas
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '18px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '18px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>Sin notificaciones.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  background: n.leida ? 'white' : '#eff6ff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  {!n.leida && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2563eb', marginTop: '5px', flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>{n.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#4a5568', marginTop: '2px' }}>{n.message}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>{tiempoRelativo(n.createdAt)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

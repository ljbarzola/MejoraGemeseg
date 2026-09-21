import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { getPendingSurveys } from '../../services/personal.service';

// Aviso "dentro de la app" de encuestas pendientes por responder — el
// reemplazo simple a un sistema de notificaciones completo (fuera de
// alcance por ahora), ver PersonalDashboard/SurveysPage.
export default function PendingSurveysBanner() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    getPendingSurveys().then((list) => setCount(list.length)).catch(() => {});
  }, []);

  if (count === 0) return null;

  return (
    <div
      onClick={() => navigate('/rrhh/encuestas')}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
        background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px',
        padding: '12px 16px', margin: '0 0 20px', color: '#2b6cb0', fontSize: '0.88rem', fontWeight: 600,
      }}
    >
      <ClipboardList size={18} />
      Tienes {count} encuesta{count === 1 ? '' : 's'} pendiente{count === 1 ? '' : 's'} por responder — click para verla{count === 1 ? '' : 's'}
    </div>
  );
}

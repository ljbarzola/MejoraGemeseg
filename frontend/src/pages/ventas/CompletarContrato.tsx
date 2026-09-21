import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicContractFill, submitPublicContractFill, PublicContractFill } from '../../services/ventas.service';

// Página pública (sin sesión): el cliente llega por un link con un token y
// completa aquí las tablas que el vendedor marcó como "las llena el
// cliente" antes de que el contrato se genere y se envíe a firmar.
export default function CompletarContrato() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicContractFill | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    getPublicContractFill(token)
      .then((res) => {
        setData(res);
        const initial: Record<string, Record<string, string>[]> = {};
        res.fields.forEach((f) => { initial[f.variableName] = f.value?.length ? f.value : []; });
        setValues(initial);
        if (res.alreadySubmitted) setDone(true);
      })
      .catch((err) => setError(err?.response?.data?.message || 'Este link no es válido.'))
      .finally(() => setLoading(false));
  }, [token]);

  const addRow = (variableName: string, columns: { key: string }[], maxRows: number) => {
    setValues((prev) => {
      const rows = prev[variableName] || [];
      if (rows.length >= maxRows) return prev;
      const emptyRow = Object.fromEntries(columns.map((c) => [c.key, '']));
      return { ...prev, [variableName]: [...rows, emptyRow] };
    });
  };
  const removeRow = (variableName: string, idx: number) => {
    setValues((prev) => ({ ...prev, [variableName]: (prev[variableName] || []).filter((_, i) => i !== idx) }));
  };
  const updateCell = (variableName: string, idx: number, key: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [variableName]: (prev[variableName] || []).map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
    }));
  };

  const handleSubmit = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const result = await submitPublicContractFill(token, values);
      if (result.redirectToSign) {
        // El contrato ya se generó y se mandó a firmar — seguimos en la
        // misma sesión directo a la página de firma, sin esperar un
        // segundo correo aparte.
        window.location.href = result.redirectToSign;
        return;
      }
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo enviar la información. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const wrap = { minHeight: '100vh', background: '#f1f5f9', display: 'flex', justifyContent: 'center', padding: '40px 20px' } as const;
  const card = { width: '100%', maxWidth: 640, background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 12px 28px rgba(0,0,0,0.08)', height: 'fit-content' } as const;

  if (loading) return <div style={wrap}><div style={card}>Cargando...</div></div>;
  if (error && !data) return <div style={wrap}><div style={card}><p style={{ color: '#c33' }}>{error}</p></div></div>;
  if (!data) return null;

  if (done) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h2 style={{ margin: '0 0 8px' }}>¡Gracias, {data.clientName}!</h2>
          <p style={{ color: '#666', fontSize: 14 }}>Ya recibimos tu información. El contrato sigue su proceso normal — no necesitas hacer nada más aquí.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ margin: '0 0 4px' }}>Completa tu información</h2>
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 24px' }}>Hola {data.clientName}, por favor completa lo siguiente para tu contrato.</p>

        {data.fields.map((field) => {
          const columns = (field.tableConfig?.columns || []) as { key: string; label: string; type: string }[];
          const maxRows = field.tableConfig?.maxRows || 10;
          const rows = values[field.variableName] || [];
          return (
            <div key={field.variableName} style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>{field.label}</h3>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, 1fr) auto`, gap: 6, marginBottom: 8, alignItems: 'end' }}>
                  {columns.map((col) => (
                    <div key={col.key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 }}>{col.label}</label>
                      <input
                        type={col.type === 'DATE' ? 'date' : col.type === 'NUMBER' ? 'number' : 'text'}
                        value={row[col.key] || ''}
                        onChange={(e) => updateCell(field.variableName, i, col.key, e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <button onClick={() => removeRow(field.variableName, i)}
                    style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 12, marginBottom: 2 }}>✕</button>
                </div>
              ))}
              <button onClick={() => addRow(field.variableName, columns, maxRows)}
                style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                + Agregar fila
              </button>
              {rows.length >= maxRows && <span style={{ marginLeft: 10, fontSize: 11, color: '#999' }}>Máximo {maxRows} filas</span>}
            </div>
          );
        })}

        {error && <p style={{ color: '#c33', fontSize: 13 }}>{error}</p>}

        <button className="auth-btn" onClick={handleSubmit} disabled={saving} style={{ width: '100%', padding: 12, marginTop: 8 }}>
          {saving ? 'Enviando...' : 'Enviar información'}
        </button>
      </div>
    </div>
  );
}

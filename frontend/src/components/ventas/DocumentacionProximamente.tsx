import { Sparkles } from 'lucide-react';

// Aviso breve y en lenguaje simple de qué será Documentación cuando esté terminada.
// Mientras tanto se puede subir un documento que ya esté hecho.
export default function DocumentacionProximamente() {
  return (
    <div
      role="note"
      style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13, color: '#7c2d12' }}
    >
      <Sparkles size={20} color="#ea580c" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <strong>Próximamente: documentos automáticos y firma electrónica.</strong>
        <div style={{ marginTop: 4, lineHeight: 1.5 }}>
          Muy pronto el sistema armará solo el contrato o la propuesta, con los datos del cliente y del contrato que ya registraste,
          sin que tengas que llenarlo a mano. Después podrás enviarlo para que tu cliente lo firme desde su correo.
          Mientras tanto, si ya tienes el documento hecho (por ejemplo, el contrato firmado en PDF), súbelo con «Nuevo documento» → «Subir uno ya hecho».
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyLinkButtonProps {
  url: string;
  title?: string;
  size?: number;
}

// Botón de copiar enlace (no ID) al portapapeles, reutilizable en cualquier
// lugar que ya muestre un folderUrl/fileUrl de Drive.
export default function CopyLinkButton({ url, title = 'Copiar enlace', size = 14 }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Si el portapapeles no está disponible, no hacer nada visible más
      // que dejar el botón sin cambiar de estado.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size + 14, height: size + 14, padding: 0, borderRadius: '6px',
        border: '1px solid #e2e8f0', background: copied ? '#f0fff4' : 'white',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {copied ? <Check size={size} color="#276749" /> : <Copy size={size} color="#718096" />}
    </button>
  );
}

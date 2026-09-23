import { ExternalLink } from 'lucide-react';
import { buildDriveFolderLink, extractDriveFolderId } from '../../utils/driveLink';

/** Abre en Drive la carpeta del enlace (o del ID) que está en el campo de al lado. */
export default function OpenFolderButton({
  value,
  title = 'Abrir carpeta',
}: {
  value: string;
  title?: string;
}) {
  const id = extractDriveFolderId(value);
  if (!id) {
    return (
      <button
        type="button"
        className="btn-secondary icon-btn"
        disabled
        title="Pega un enlace de carpeta para abrirla"
        aria-label={title}
      >
        <ExternalLink size={16} />
      </button>
    );
  }
  return (
    <a
      className="btn-secondary icon-btn"
      href={buildDriveFolderLink(id)}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-label={title}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <ExternalLink size={16} />
    </a>
  );
}

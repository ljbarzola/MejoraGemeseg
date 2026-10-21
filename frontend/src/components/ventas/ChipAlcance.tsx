import { X } from 'lucide-react';

/** Aviso visible de que la lista está limitada al alcance del Dashboard («mis clientes» o un vendedor), con su «Quitar». */
export default function ChipAlcance({
  alcance, total, onQuitar, que = 'clientes y prospectos',
}: { alcance: string | null; total: number; onQuitar: () => void; /** Qué se está contando: «clientes y prospectos», «posibles clientes»… */ que?: string }) {
  if (!alcance) return null;
  const quien = alcance === 'mine' ? `tus ${que}` : `los ${que} de ese vendedor`;
  return (
    <div className="chip-alcance" role="status">
      <span>Mostrando solo {quien} ({total}).</span>
      <button type="button" onClick={onQuitar} title="Ver todos">
        <X size={14} /> Quitar
      </button>
    </div>
  );
}

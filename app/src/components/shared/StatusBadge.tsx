import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  ativo: 'status-active',
  armazenado: 'status-active',
  executada: 'status-active',
  executado: 'status-active',
  aprovada: 'status-active',
  aprovado: 'status-active',
  pago: 'status-active',
  rascunho: 'status-neutral',
  aguardando_entrada: 'status-warning',
  solicitada: 'status-warning',
  reservado_saida: 'status-warning',
  em_transferencia: 'status-warning',
  suspenso: 'status-warning',
  separado: 'status-warning',
  pendente: 'status-warning',
  vencido: 'status-danger',
  encerrado: 'status-neutral',
  expedido: 'status-neutral',
  cancelada: 'status-danger',
  inativo: 'status-danger',
  borrador: 'status-neutral',
  emitida: 'status-active',
  anulada: 'status-neutral',
  pagada: 'status-active',
  parcial: 'status-warning',
  vencida: 'status-danger',
  acreditada: 'status-neutral',
};

export const statusLabels: Record<string, string> = {
  ativo: 'Activo',
  armazenado: 'Almacenado',
  executada: 'Ejecutada',
  executado: 'Ejecutado',
  aprovada: 'Aprobada',
  aprovado: 'Aprobado',
  pago: 'Pagado',
  rascunho: 'Borrador',
  aguardando_entrada: 'En espera',
  solicitada: 'Solicitada',
  reservado_saida: 'Reservado para salida',
  em_transferencia: 'En transferencia',
  suspenso: 'Suspendido',
  separado: 'Separado',
  pendente: 'Pendiente',
  vencido: 'Vencido',
  encerrado: 'Cerrado',
  expedido: 'Expedido',
  cancelada: 'Cancelada',
  inativo: 'Inactivo',
  borrador: 'Borrador',
  emitida: 'Emitida',
  anulada: 'Anulada',
  pagada: 'Pagada',
  parcial: 'Pago parcial',
  vencida: 'Vencida',
  acreditada: 'Nota de crédito',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(statusStyles[status] || 'status-neutral')}>
      {statusLabels[status] || status}
    </span>
  );
}

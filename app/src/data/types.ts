// Type definitions for operational data - kept compatible with old interfaces
// but now backed by Supabase

export interface Client {
  id: string;
  codigo: string;
  razaoSocial: string;
  nomeFantasia: string;
  rucCnpj: string;
  contato: string;
  email: string;
  telefone: string;
  endereco: string;
  categoriaMercadoria: string;
  observacoes?: string;
  ativo?: boolean;
  agenteId?: string | null;
}

export interface Contract {
  id: string;
  clienteId: string;
  numero: string;
  dataInicio: string;
  dataTermino: string;
  status: 'rascunho' | 'ativo' | 'suspenso' | 'vencido' | 'encerrado';
  posicoesContratadas: number;
  posicoesOcupadas: number;
  precoPorPosicao: number;
  moeda: string;
  movimentacoesInclusas: number;
  precoMovExtra: number;
  percentualSeguro: number;
  observacoes?: string;
  /** Recargo por posición/mes (plazo corto o cantidad baja), en línea separada en la factura */
  recargoPorPosicao?: number;
  recargoDescricao?: string;
  /** Día del mes en que vence la factura */
  diaVencimento?: number;
  /** Cobra adicional por pallets mayores a 1,2 m³ (1,2 × 1,0 × 1,0 m) (si el precio no lo incluye) */
  cobrarSobremedida?: boolean;
  archivoFirmado?: string | null;
  firmadoAt?: string | null;
  clausulasEspeciales?: string;
  docEstado?: 'borrador' | 'para_firma' | 'aceptado' | 'firmado';
  /** Posiciones adicionales por adendas vigentes hoy (no cambian la comisión ni el precio original) */
  posicoesAdicionais?: number;
  /** Valor mensual de esas posiciones adicionales (precio de cada adenda) */
  valorAdicional?: number;
}

/** Posiciones contratadas hoy: contrato original + adendas vigentes */
export const contractTotalPositions = (c: Pick<Contract, 'posicoesContratadas' | 'posicoesAdicionais'>) => c.posicoesContratadas + (c.posicoesAdicionais || 0);

export interface Pallet {
  id: string;
  clienteId: string;
  contratoId: string;
  sku: string;
  descricao: string;
  lote?: string;
  quantidade?: number;
  peso: number;
  valorDeclarado: number;
  status: 'aguardando_entrada' | 'armazenado' | 'reservado_saida' | 'em_transferencia' | 'expedido';
  localizacao: string;
  dataEntrada: string;
  ultimaMovimentacao: string;
  largo?: number;
  ancho?: number;
  alto?: number;
  seguro: boolean;
  palletDuplo?: boolean;
  localizacao2?: string;
}

export interface Movement {
  id: string;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'ajuste' | 'avaria' | 'bloqueio';
  dataHora: string;
  operador: string;
  clienteId: string;
  contratoId: string;
  palletId: string;
  origemLocal: string;
  destinoLocal: string;
  motivo: string;
  status: 'solicitada' | 'aprovada' | 'executada' | 'cancelada';
  pesoInicial: number;
  pesoFinal: number;
  comprovanteAssinado?: string;
  comprovanteData?: string;
  custoExtra?: {
    categoria: ExtraCostCategory;
    descricao: string;
  };
  interna?: boolean;
  novoValorDeclarado?: number;
  autorizadoId?: string;
  operadorId?: string;
}

export interface AuthorizedContact {
  id: string;
  clienteId: string;
  nome: string;
  cargo: string;
  documento: string;
  tipoDocumento: 'CI' | 'RG' | 'Passaporte';
  telefone: string;
  email: string;
  ativo: boolean;
  fotoDocumento?: string;
  observacoes?: string;
  fotoDocumentoUrl?: string;
  fotoAutorizadoUrl?: string;
  solicitadoPorCliente?: boolean;
}

export interface Invoice {
  id: string;
  clienteId: string;
  contratoId: string;
  competencia: string;
  dataVencimento: string;
  valor: number;
  status: 'pago' | 'pendente' | 'vencido';
  comprovante?: string;
  comprovanteData?: string;
  observacoes?: string;
}

export type ExtraCostCategory = 'movimentacao_extra' | 'embalagem' | 'pallet_extra' | 'frete' | 'seguro_adicional' | 'mao_de_obra' | 'outros';

export const EXTRA_COST_CATEGORIES: Record<ExtraCostCategory, string> = {
  movimentacao_extra: 'Movimiento Extra',
  embalagem: 'Embalaje',
  pallet_extra: 'Pallet Extra',
  frete: 'Flete (Camión Propio)',
  seguro_adicional: 'Seguro Adicional',
  mao_de_obra: 'Mano de Obra',
  outros: 'Otros',
};

export interface ExtraCost {
  id: string;
  clienteId: string;
  contratoId: string;
  competencia: string;
  categoria: ExtraCostCategory;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  moeda: string;
  dataCriacao: string;
  observacoes?: string;
  origem: 'operador' | 'admin';
  statusAprovacao: 'pendente' | 'aprovado';
  movimentacaoId?: string;
}

export type CellStatus = 'free' | 'occupied' | 'blocked' | 'reserved';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  notes: string;
  active: boolean;
  /** Calles después de las cuales hay pasillo, ej. "A,C,E" (dibujo de la planta) */
  pasillos?: string;
}

export type PositionType = 'selectivo' | 'drive-in' | 'piso';

export interface WarehousePosition {
  /** Id único em todos os depósitos: "<DEPÓSITO>:<código>", ex.: CDE1:A-01-1-1 */
  id: string;
  /** Código curto, igual em depósitos diferentes: A-01-1-1 */
  code: string;
  warehouseId: string;
  tipo: PositionType;
  rua: string;
  bloco: number;
  nivel: number;
  posicao: number;
  status: CellStatus;
  palletId?: string;
  clienteId?: string;
  capacidadeKg: number;
}

export interface SystemAlert {
  id: string;
  tipo: 'capacidad' | 'contrato' | 'vencimiento' | 'operacion';
  mensaje: string;
  fecha: string;
  clienteId?: string;
  contratoId?: string;
  resuelto: boolean;
}

export interface ClientRequest {
  id: string;
  clienteId: string;
  palletIds: string[];
  tipo: 'coleta' | 'acesso' | 'ingreso';
  horarioEstimado: string;
  dataEstimada: string;
  margemTempo: number;
  quantidade?: number;
  dataCriacao: string;
  status: 'pendente' | 'separado' | 'executado' | 'cancelado';
  operadorId?: string;
  movimentoIds?: string[];
  observacoes?: string;
}

export type ExpenseStatus = 'pendente' | 'pago' | 'vencido';
export type ExpenseCategory =
  | 'alquiler' | 'salarios' | 'servicios' | 'mantenimiento'
  | 'combustible' | 'seguros' | 'impuestos' | 'insumos' | 'otros' | 'cac' | 'inversion';

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  alquiler: 'Alquiler',
  salarios: 'Salarios',
  servicios: 'Servicios (Luz, Agua, Internet)',
  mantenimiento: 'Mantenimiento',
  combustible: 'Combustible',
  seguros: 'Seguros',
  impuestos: 'Impuestos',
  insumos: 'Insumos y Materiales',
  otros: 'Otros',
  cac: 'Comisión de captación (CAC)',
  inversion: 'Inversión (activo fijo)',
};

export interface Expense {
  id: string;
  competencia: string;
  categoria: ExpenseCategory;
  descricao: string;
  valor: number;
  moeda: string;
  valorUSD: number;
  cambioDia?: number;
  dataCriacao: string;
  dataVencimento: string;
  status: ExpenseStatus;
  observacoes?: string;
}

// A planta de cada depósito vem do banco (ruas, blocos, níveis). Nada fixo no código.

/** Código curto de uma posição a partir do id ("CDE1:A-01-1-1" → "A-01-1-1") */
export function positionCode(posId: string | undefined | null): string {
  if (!posId) return '';
  const i = posId.indexOf(':');
  return i >= 0 ? posId.slice(i + 1) : posId;
}

/** Código do depósito a partir do id ("CDE1:A-01-1-1" → "CDE1") */
export function positionWarehouseCode(posId: string | undefined | null): string {
  if (!posId) return '';
  const i = posId.indexOf(':');
  return i >= 0 ? posId.slice(0, i) : '';
}

/** Rótulo para tela e documentos: "A-01-1-1 · CDE1" (o depósito só aparece se houver mais de um) */
export function positionLabel(posId: string | undefined | null, showWarehouse = true): string {
  if (!posId) return '';
  const code = positionCode(posId);
  const wh = positionWarehouseCode(posId);
  return showWarehouse && wh ? `${code} · ${wh}` : code;
}

/** Nível do chão: nível 1 (lido do código "A-01-1-1") */
export function isGroundPosition(posId: string): boolean {
  const parts = positionCode(posId).split('-');
  return parts.length >= 3 && parts[2] === '1';
}

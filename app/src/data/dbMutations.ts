// Database mutation helpers — each returns the updated record or throws
import { supabase } from "@/integrations/supabase/client";

// ============ Atomic RPC wrappers ============

export async function rpcRegisterPalletEntry(params: {
  clienteId: string; contratoId: string; sku: string; descricao: string;
  lote?: string; quantidade?: number; peso?: number; valorDeclarado?: number;
  localizacao?: string; localizacao2?: string;
  largo?: number; ancho?: number; alto?: number;
  seguro?: boolean; palletDuplo?: boolean;
  positionId?: string; position2Id?: string;
  operador?: string; operadorId?: string;
}): Promise<{ pallet_id: string; movement_id: string; sku: string; localizacao: string | null; localizacao2: string | null }> {
  const { data, error } = await (supabase.rpc as any)('register_pallet_entry', {
    p_cliente_id: params.clienteId,
    p_contrato_id: params.contratoId,
    p_sku: params.sku,
    p_descricao: params.descricao,
    p_lote: params.lote || null,
    p_quantidade: params.quantidade ?? null,
    p_peso: params.peso ?? 0,
    p_valor_declarado: params.valorDeclarado ?? 0,
    p_localizacao: params.localizacao || '',
    p_localizacao2: params.localizacao2 || null,
    p_largo: params.largo ?? null,
    p_ancho: params.ancho ?? null,
    p_alto: params.alto ?? null,
    p_seguro: params.seguro ?? false,
    p_pallet_duplo: params.palletDuplo ?? false,
    p_position_id: params.positionId || null,
    p_position2_id: params.position2Id || null,
    p_operador: params.operador || '',
    p_operador_id: params.operadorId || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function rpcExecutePalletExit(params: {
  palletId: string; motivo?: string; autorizadoId?: string;
  operador?: string; operadorId?: string; pesoFinal?: number; destino?: string;
}): Promise<{ success: boolean; positions_freed: number; movement_id: string }> {
  const { data, error } = await (supabase.rpc as any)('execute_pallet_exit', {
    p_pallet_id: params.palletId,
    p_motivo: params.motivo || '',
    p_autorizado_id: params.autorizadoId || null,
    p_operador: params.operador || '',
    p_operador_id: params.operadorId || null,
    p_peso_final: params.pesoFinal ?? 0,
    p_destino: params.destino || 'Exterior',
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function rpcTransferPallet(params: {
  palletId: string; newPositionId: string; newPosition2Id?: string;
  motivo?: string; operador?: string; operadorId?: string;
}): Promise<{ success: boolean; new_location: string; new_location2: string | null; movement_id: string }> {
  const { data, error } = await (supabase.rpc as any)('transfer_pallet', {
    p_pallet_id: params.palletId,
    p_new_position_id: params.newPositionId,
    p_new_position2_id: params.newPosition2Id || null,
    p_motivo: params.motivo || '',
    p_operador: params.operador || '',
    p_operador_id: params.operadorId || null,
  });
  if (error) throw new Error(error.message);
  return data;
}
import type {
  Client, Contract, Pallet, Movement, AuthorizedContact,
  Invoice, ExtraCost, WarehousePosition, SystemAlert, ClientRequest,
  Expense, ExtraCostCategory, CellStatus,
} from "@/data/types";

async function dbInsert(table: string, payload: any) {
  const { error } = await (supabase.from(table as any) as any).insert(payload);
  if (error) throw new Error(error.message);
}

async function dbUpdate(table: string, payload: any, match: Record<string, any>) {
  let query = (supabase.from(table as any) as any).update(payload);
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

async function dbDelete(table: string, match: Record<string, any>) {
  let query = (supabase.from(table as any) as any).delete();
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

// ---- CLIENTS ----
export async function dbInsertClient(c: Omit<Client, 'id'> & { id?: string }) {
  await dbInsert('clients', {
    ...(c.id ? { id: c.id } : {}),
    codigo: c.codigo, razao_social: c.razaoSocial, nome_fantasia: c.nomeFantasia,
    ruc_cnpj: c.rucCnpj, contato: c.contato, email: c.email,
    telefone: c.telefone, endereco: c.endereco,
    categoria_mercadoria: c.categoriaMercadoria, observacoes: c.observacoes || null,
    agente_id: c.agenteId || null,
  });
}

export async function dbUpdateClient(id: string, c: Partial<Client>) {
  const payload: any = {};
  if (c.codigo !== undefined) payload.codigo = c.codigo;
  if (c.razaoSocial !== undefined) payload.razao_social = c.razaoSocial;
  if (c.nomeFantasia !== undefined) payload.nome_fantasia = c.nomeFantasia;
  if (c.rucCnpj !== undefined) payload.ruc_cnpj = c.rucCnpj;
  if (c.contato !== undefined) payload.contato = c.contato;
  if (c.email !== undefined) payload.email = c.email;
  if (c.telefone !== undefined) payload.telefone = c.telefone;
  if (c.endereco !== undefined) payload.endereco = c.endereco;
  if (c.categoriaMercadoria !== undefined) payload.categoria_mercadoria = c.categoriaMercadoria;
  if (c.observacoes !== undefined) payload.observacoes = c.observacoes;
  if (c.ativo !== undefined) payload.ativo = c.ativo;
  if (c.agenteId !== undefined) payload.agente_id = c.agenteId || null;
  await dbUpdate('clients', payload, { id });
}

export async function dbDeleteClient(id: string) {
  await dbDelete('clients', { id });
}

// ---- CONTRACTS ----
export async function dbInsertContract(c: Omit<Contract, 'id'> & { id?: string }) {
  await dbInsert('contracts', {
    ...(c.id ? { id: c.id } : {}),
    cliente_id: c.clienteId, numero: c.numero, data_inicio: c.dataInicio,
    data_termino: c.dataTermino, status: c.status,
    posicoes_contratadas: c.posicoesContratadas, posicoes_ocupadas: c.posicoesOcupadas,
    preco_por_posicao: c.precoPorPosicao, moeda: c.moeda,
    movimentacoes_inclusas: c.movimentacoesInclusas, preco_mov_extra: c.precoMovExtra,
    percentual_seguro: c.percentualSeguro, observacoes: c.observacoes || null,
    recargo_por_posicao: c.recargoPorPosicao ?? 0, recargo_descricao: c.recargoDescricao ?? '',
    dia_vencimento: c.diaVencimento ?? 10, cobrar_sobremedida: c.cobrarSobremedida ?? false,
  });
}

export async function dbUpdateContract(id: string, c: Partial<Contract>) {
  const payload: any = {};
  if (c.clienteId !== undefined) payload.cliente_id = c.clienteId;
  if (c.numero !== undefined) payload.numero = c.numero;
  if (c.dataInicio !== undefined) payload.data_inicio = c.dataInicio;
  if (c.dataTermino !== undefined) payload.data_termino = c.dataTermino;
  if (c.status !== undefined) payload.status = c.status;
  if (c.posicoesContratadas !== undefined) payload.posicoes_contratadas = c.posicoesContratadas;
  if (c.posicoesOcupadas !== undefined) payload.posicoes_ocupadas = c.posicoesOcupadas;
  if (c.precoPorPosicao !== undefined) payload.preco_por_posicao = c.precoPorPosicao;
  if (c.moeda !== undefined) payload.moeda = c.moeda;
  if (c.movimentacoesInclusas !== undefined) payload.movimentacoes_inclusas = c.movimentacoesInclusas;
  if (c.precoMovExtra !== undefined) payload.preco_mov_extra = c.precoMovExtra;
  if (c.percentualSeguro !== undefined) payload.percentual_seguro = c.percentualSeguro;
  if (c.observacoes !== undefined) payload.observacoes = c.observacoes;
  if (c.recargoPorPosicao !== undefined) payload.recargo_por_posicao = c.recargoPorPosicao;
  if (c.recargoDescricao !== undefined) payload.recargo_descricao = c.recargoDescricao;
  if (c.diaVencimento !== undefined) payload.dia_vencimento = c.diaVencimento;
  if (c.cobrarSobremedida !== undefined) payload.cobrar_sobremedida = c.cobrarSobremedida;
  await dbUpdate('contracts', payload, { id });
}

export async function dbDeleteContract(id: string) {
  await dbDelete('contracts', { id });
}

// ---- PALLETS ----
export async function dbInsertPallet(p: Omit<Pallet, 'id'> & { id?: string }) {
  await dbInsert('pallets', {
    ...(p.id ? { id: p.id } : {}),
    cliente_id: p.clienteId, contrato_id: p.contratoId, sku: p.sku,
    descricao: p.descricao, lote: p.lote || null, quantidade: p.quantidade ?? null,
    peso: p.peso, valor_declarado: p.valorDeclarado, status: p.status,
    localizacao: p.localizacao, data_entrada: p.dataEntrada,
    ultima_movimentacao: p.ultimaMovimentacao,
    largo: p.largo ?? null, ancho: p.ancho ?? null, alto: p.alto ?? null,
    seguro: p.seguro, pallet_duplo: p.palletDuplo ?? false,
    localizacao2: p.localizacao2 || null,
  });
}

export async function dbUpdatePallet(id: string, p: Partial<Pallet>) {
  const payload: any = {};
  if (p.clienteId !== undefined) payload.cliente_id = p.clienteId;
  if (p.contratoId !== undefined) payload.contrato_id = p.contratoId;
  if (p.sku !== undefined) payload.sku = p.sku;
  if (p.descricao !== undefined) payload.descricao = p.descricao;
  if (p.lote !== undefined) payload.lote = p.lote;
  if (p.quantidade !== undefined) payload.quantidade = p.quantidade;
  if (p.peso !== undefined) payload.peso = p.peso;
  if (p.valorDeclarado !== undefined) payload.valor_declarado = p.valorDeclarado;
  if (p.status !== undefined) payload.status = p.status;
  if (p.localizacao !== undefined) payload.localizacao = p.localizacao;
  if (p.dataEntrada !== undefined) payload.data_entrada = p.dataEntrada;
  if (p.ultimaMovimentacao !== undefined) payload.ultima_movimentacao = p.ultimaMovimentacao;
  if (p.largo !== undefined) payload.largo = p.largo;
  if (p.ancho !== undefined) payload.ancho = p.ancho;
  if (p.alto !== undefined) payload.alto = p.alto;
  if (p.seguro !== undefined) payload.seguro = p.seguro;
  if (p.palletDuplo !== undefined) payload.pallet_duplo = p.palletDuplo;
  if (p.localizacao2 !== undefined) payload.localizacao2 = p.localizacao2;
  await dbUpdate('pallets', payload, { id });
}

export async function dbDeletePallet(id: string) {
  const { data, error } = await (supabase.rpc as any)('delete_pallet_safe', {
    p_pallet_id: id,
  });
  if (error) throw new Error(error.message);
  return data;
}

// ---- MOVEMENTS ----
// Só envia a data se vier completa (com fuso). Caso contrário o banco usa now(),
// evitando datas trocadas entre o horário local e o UTC.
const hasTz = (v?: string) => !!v && /T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(v);

export async function dbInsertMovement(m: Omit<Movement, 'id' | 'dataHora'> & { id?: string; dataHora?: string }): Promise<string> {
  const id = m.id || crypto.randomUUID();
  await dbInsert('movements', {
    id,
    ...(hasTz(m.dataHora) ? { data_hora: m.dataHora } : {}),
    tipo: m.tipo, operador: m.operador,
    cliente_id: m.clienteId, contrato_id: m.contratoId, pallet_id: m.palletId,
    origem_local: m.origemLocal, destino_local: m.destinoLocal, motivo: m.motivo,
    status: m.status, peso_inicial: m.pesoInicial, peso_final: m.pesoFinal,
    comprovante_assinado: m.comprovanteAssinado || null,
    comprovante_data: m.comprovanteData || null,
    custo_extra_categoria: m.custoExtra?.categoria || null,
    custo_extra_descricao: m.custoExtra?.descricao || null,
    interna: m.interna ?? false,
    novo_valor_declarado: m.novoValorDeclarado ?? null,
    autorizado_id: m.autorizadoId || null,
    operador_id: m.operadorId || null,
  });
  return id;
}

export async function dbUpdateMovement(id: string, m: Partial<any>) {
  const payload: any = {};
  if (m.status !== undefined) payload.status = m.status;
  if (m.comprovanteAssinado !== undefined) payload.comprovante_assinado = m.comprovanteAssinado;
  if (m.comprovanteData !== undefined) payload.comprovante_data = m.comprovanteData;
  if (m.pesoFinal !== undefined) payload.peso_final = m.pesoFinal;
  if (m.destinoLocal !== undefined) payload.destino_local = m.destinoLocal;
  if (m.origemLocal !== undefined) payload.origem_local = m.origemLocal;
  if (m.operadorId !== undefined) payload.operador_id = m.operadorId;
  await dbUpdate('movements', payload, { id });
}

// ---- AUTHORIZED CONTACTS ----
export async function dbInsertAuthorizedContact(ac: Omit<AuthorizedContact, 'id'> & { id?: string }) {
  await dbInsert('authorized_contacts', {
    ...(ac.id ? { id: ac.id } : {}),
    cliente_id: ac.clienteId, nome: ac.nome, cargo: ac.cargo,
    documento: ac.documento, tipo_documento: ac.tipoDocumento,
    telefone: ac.telefone, email: ac.email, ativo: ac.ativo,
    foto_documento: ac.fotoDocumento || null, observacoes: ac.observacoes || null,
    foto_documento_url: ac.fotoDocumentoUrl || null,
    foto_autorizado_url: ac.fotoAutorizadoUrl || null,
  });
}

export async function dbUpdateAuthorizedContact(id: string, ac: Partial<AuthorizedContact>) {
  const payload: any = {};
  if (ac.nome !== undefined) payload.nome = ac.nome;
  if (ac.cargo !== undefined) payload.cargo = ac.cargo;
  if (ac.documento !== undefined) payload.documento = ac.documento;
  if (ac.tipoDocumento !== undefined) payload.tipo_documento = ac.tipoDocumento;
  if (ac.telefone !== undefined) payload.telefone = ac.telefone;
  if (ac.email !== undefined) payload.email = ac.email;
  if (ac.ativo !== undefined) payload.ativo = ac.ativo;
  if (ac.fotoDocumento !== undefined) payload.foto_documento = ac.fotoDocumento;
  if (ac.observacoes !== undefined) payload.observacoes = ac.observacoes;
  if (ac.fotoDocumentoUrl !== undefined) payload.foto_documento_url = ac.fotoDocumentoUrl;
  if (ac.fotoAutorizadoUrl !== undefined) payload.foto_autorizado_url = ac.fotoAutorizadoUrl;
  await dbUpdate('authorized_contacts', payload, { id });
}

export async function dbDeleteAuthorizedContact(id: string) {
  await dbDelete('authorized_contacts', { id });
}

// ---- INVOICES ----
export async function dbInsertInvoice(inv: Omit<Invoice, 'id'> & { id?: string }) {
  await dbInsert('invoices', {
    ...(inv.id ? { id: inv.id } : {}),
    cliente_id: inv.clienteId, contrato_id: inv.contratoId,
    competencia: inv.competencia, data_vencimento: inv.dataVencimento,
    valor: inv.valor, status: inv.status,
    comprovante: inv.comprovante || null,
    comprovante_data: inv.comprovanteData || null,
    observacoes: inv.observacoes || null,
  });
}

export async function dbUpdateInvoice(id: string, inv: Partial<Invoice>) {
  const payload: any = {};
  if (inv.status !== undefined) payload.status = inv.status;
  if (inv.comprovante !== undefined) payload.comprovante = inv.comprovante;
  if (inv.comprovanteData !== undefined) payload.comprovante_data = inv.comprovanteData;
  if (inv.valor !== undefined) payload.valor = inv.valor;
  if (inv.observacoes !== undefined) payload.observacoes = inv.observacoes;
  await dbUpdate('invoices', payload, { id });
}

export async function dbDeleteInvoice(id: string) {
  await dbDelete('invoices', { id });
}

// ---- EXTRA COSTS ----
export async function dbInsertExtraCost(ec: Omit<ExtraCost, 'id'> & { id?: string }) {
  await dbInsert('extra_costs', {
    ...(ec.id ? { id: ec.id } : {}),
    cliente_id: ec.clienteId, contrato_id: ec.contratoId,
    competencia: ec.competencia, categoria: ec.categoria,
    descricao: ec.descricao, quantidade: ec.quantidade,
    valor_unitario: ec.valorUnitario, valor_total: ec.valorTotal,
    moeda: ec.moeda, data_criacao: ec.dataCriacao,
    observacoes: ec.observacoes || null, origem: ec.origem,
    status_aprovacao: ec.statusAprovacao,
    movimentacao_id: ec.movimentacaoId || null,
  });
}

export async function dbUpdateExtraCost(id: string, ec: Partial<ExtraCost>) {
  const payload: any = {};
  if (ec.statusAprovacao !== undefined) payload.status_aprovacao = ec.statusAprovacao;
  if (ec.descricao !== undefined) payload.descricao = ec.descricao;
  if (ec.quantidade !== undefined) payload.quantidade = ec.quantidade;
  if (ec.valorUnitario !== undefined) payload.valor_unitario = ec.valorUnitario;
  if (ec.valorTotal !== undefined) payload.valor_total = ec.valorTotal;
  if (ec.observacoes !== undefined) payload.observacoes = ec.observacoes;
  await dbUpdate('extra_costs', payload, { id });
}

export async function dbDeleteExtraCost(id: string) {
  await dbDelete('extra_costs', { id });
}

// ---- WAREHOUSE POSITIONS ----
export async function dbUpdateWarehousePosition(id: string, wp: Partial<WarehousePosition>) {
  const payload: any = {};
  if (wp.status !== undefined) payload.status = wp.status;
  if (wp.palletId !== undefined) payload.pallet_id = wp.palletId || null;
  if (wp.clienteId !== undefined) payload.cliente_id = wp.clienteId || null;
  await dbUpdate('warehouse_positions', payload, { id });
}

/** Bloqueia ou libera várias posições SEM pallet (função do banco; não mexe em ocupadas) */
export async function rpcSetPositionsBlocked(ids: string[], blocked: boolean): Promise<{ changed: number }> {
  const { data, error } = await (supabase.rpc as any)('set_positions_blocked', { p_ids: ids, p_blocked: blocked });
  if (error) throw new Error(error.message);
  return data;
}

// ---- SYSTEM ALERTS ----
export async function dbInsertSystemAlert(sa: Omit<SystemAlert, 'id'> & { id?: string }) {
  await dbInsert('system_alerts', {
    ...(sa.id ? { id: sa.id } : {}),
    tipo: sa.tipo, mensaje: sa.mensaje, fecha: sa.fecha,
    cliente_id: sa.clienteId || null, contrato_id: sa.contratoId || null,
    resuelto: sa.resuelto,
  });
}

export async function dbUpdateSystemAlert(id: string, sa: Partial<SystemAlert>) {
  const payload: any = {};
  if (sa.resuelto !== undefined) payload.resuelto = sa.resuelto;
  if (sa.mensaje !== undefined) payload.mensaje = sa.mensaje;
  await dbUpdate('system_alerts', payload, { id });
}

export async function dbDeleteSystemAlert(id: string) {
  await dbDelete('system_alerts', { id });
}

// ---- CLIENT REQUESTS ----
export async function dbInsertClientRequest(cr: Omit<ClientRequest, 'id'> & { id?: string }) {
  await dbInsert('client_requests', {
    ...(cr.id ? { id: cr.id } : {}),
    cliente_id: cr.clienteId, pallet_ids: cr.palletIds,
    tipo: cr.tipo, horario_estimado: cr.horarioEstimado,
    data_estimada: cr.dataEstimada, margem_tempo: cr.margemTempo,
    quantidade: cr.quantidade ?? null, data_criacao: cr.dataCriacao,
    status: cr.status, operador_id: cr.operadorId || null,
    movimento_ids: cr.movimentoIds || [], observacoes: cr.observacoes || null,
  });
}

export async function dbUpdateClientRequest(id: string, cr: Partial<ClientRequest>) {
  const payload: any = {};
  if (cr.status !== undefined) payload.status = cr.status;
  if (cr.operadorId !== undefined) payload.operador_id = cr.operadorId;
  if (cr.movimentoIds !== undefined) payload.movimento_ids = cr.movimentoIds;
  if (cr.observacoes !== undefined) payload.observacoes = cr.observacoes;
  await dbUpdate('client_requests', payload, { id });
}

// ---- EXPENSES ----
export async function dbInsertExpense(ex: Omit<Expense, 'id'> & { id?: string }) {
  await dbInsert('expenses', {
    ...(ex.id ? { id: ex.id } : {}),
    competencia: ex.competencia, categoria: ex.categoria,
    descricao: ex.descricao, valor: ex.valor, moeda: ex.moeda,
    valor_usd: ex.valorUSD, cambio_dia: ex.cambioDia ?? null,
    data_criacao: ex.dataCriacao, data_vencimento: ex.dataVencimento,
    status: ex.status, observacoes: ex.observacoes || null,
  });
}

export async function dbUpdateExpense(id: string, ex: Partial<Expense>) {
  const payload: any = {};
  if (ex.competencia !== undefined) payload.competencia = ex.competencia;
  if (ex.categoria !== undefined) payload.categoria = ex.categoria;
  if (ex.descricao !== undefined) payload.descricao = ex.descricao;
  if (ex.valor !== undefined) payload.valor = ex.valor;
  if (ex.moeda !== undefined) payload.moeda = ex.moeda;
  if (ex.valorUSD !== undefined) payload.valor_usd = ex.valorUSD;
  if (ex.cambioDia !== undefined) payload.cambio_dia = ex.cambioDia;
  if (ex.dataVencimento !== undefined) payload.data_vencimento = ex.dataVencimento;
  if (ex.status !== undefined) payload.status = ex.status;
  if (ex.observacoes !== undefined) payload.observacoes = ex.observacoes;
  await dbUpdate('expenses', payload, { id });
}

export async function dbDeleteExpense(id: string) {
  await dbDelete('expenses', { id });
}

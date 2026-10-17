import { supabase } from "@/integrations/supabase/client";
import type {
  Client, Contract, Pallet, Movement, AuthorizedContact,
  Invoice, ExtraCost, WarehousePosition, SystemAlert, ClientRequest, Expense, Warehouse,
} from "./types";

// ============ DB → App mappers ============

export function mapClient(r: any): Client {
  return {
    id: r.id, codigo: r.codigo, razaoSocial: r.razao_social,
    nomeFantasia: r.nome_fantasia, rucCnpj: r.ruc_cnpj, contato: r.contato,
    email: r.email, telefone: r.telefone, endereco: r.endereco,
    categoriaMercadoria: r.categoria_mercadoria, observacoes: r.observacoes ?? undefined,
    ativo: r.ativo !== false,
    agenteId: r.agente_id ?? null,
  };
}

export function mapContract(r: any): Contract {
  return {
    id: r.id, clienteId: r.cliente_id, numero: r.numero,
    dataInicio: r.data_inicio, dataTermino: r.data_termino, status: r.status,
    posicoesContratadas: r.posicoes_contratadas, posicoesOcupadas: r.posicoes_ocupadas,
    precoPorPosicao: Number(r.preco_por_posicao), moeda: r.moeda,
    movimentacoesInclusas: r.movimentacoes_inclusas, precoMovExtra: Number(r.preco_mov_extra),
    percentualSeguro: Number(r.percentual_seguro), observacoes: r.observacoes ?? undefined,
    recargoPorPosicao: Number(r.recargo_por_posicao ?? 0), recargoDescricao: r.recargo_descricao ?? '',
    diaVencimento: r.dia_vencimento ?? 10, cobrarSobremedida: !!r.cobrar_sobremedida,
    archivoFirmado: r.archivo_firmado ?? null, firmadoAt: r.firmado_at ?? null,
    clausulasEspeciales: r.clausulas_especiales ?? '', docEstado: r.doc_estado ?? 'borrador',
  };
}

export function mapPallet(r: any): Pallet {
  return {
    id: r.id, clienteId: r.cliente_id, contratoId: r.contrato_id,
    sku: r.sku, descricao: r.descricao, lote: r.lote ?? undefined,
    quantidade: r.quantidade ?? undefined, peso: Number(r.peso),
    valorDeclarado: Number(r.valor_declarado), status: r.status,
    localizacao: r.localizacao, dataEntrada: r.data_entrada,
    ultimaMovimentacao: r.ultima_movimentacao,
    largo: r.largo ? Number(r.largo) : undefined,
    ancho: r.ancho ? Number(r.ancho) : undefined,
    alto: r.alto ? Number(r.alto) : undefined,
    seguro: r.seguro, palletDuplo: r.pallet_duplo ?? undefined,
    localizacao2: r.localizacao2 ?? undefined,
  };
}

export function mapMovement(r: any): Movement {
  return {
    id: r.id, tipo: r.tipo, dataHora: r.data_hora, operador: r.operador,
    clienteId: r.cliente_id, contratoId: r.contrato_id, palletId: r.pallet_id,
    origemLocal: r.origem_local, destinoLocal: r.destino_local, motivo: r.motivo,
    status: r.status, pesoInicial: Number(r.peso_inicial), pesoFinal: Number(r.peso_final),
    comprovanteAssinado: r.comprovante_assinado ?? undefined,
    comprovanteData: r.comprovante_data ?? undefined,
    custoExtra: r.custo_extra_categoria ? { categoria: r.custo_extra_categoria, descricao: r.custo_extra_descricao || '' } : undefined,
    interna: r.interna ?? undefined,
    novoValorDeclarado: r.novo_valor_declarado ? Number(r.novo_valor_declarado) : undefined,
    autorizadoId: r.autorizado_id ?? undefined,
    operadorId: r.operador_id ?? undefined,
  };
}

export function mapAuthorizedContact(r: any): AuthorizedContact {
  return {
    id: r.id, clienteId: r.cliente_id, nome: r.nome, cargo: r.cargo,
    documento: r.documento, tipoDocumento: r.tipo_documento, telefone: r.telefone,
    email: r.email, ativo: r.ativo, fotoDocumento: r.foto_documento ?? undefined,
    observacoes: r.observacoes ?? undefined, fotoDocumentoUrl: r.foto_documento_url ?? undefined,
    fotoAutorizadoUrl: r.foto_autorizado_url ?? undefined,
    solicitadoPorCliente: !!r.solicitado_por_cliente,
  };
}

export function mapInvoice(r: any): Invoice {
  return {
    id: r.id, clienteId: r.cliente_id, contratoId: r.contrato_id,
    competencia: r.competencia, dataVencimento: r.data_vencimento,
    valor: Number(r.valor), status: r.status,
    comprovante: r.comprovante ?? undefined,
    comprovanteData: r.comprovante_data ?? undefined,
    observacoes: r.observacoes ?? undefined,
  };
}

export function mapExtraCost(r: any): ExtraCost {
  return {
    id: r.id, clienteId: r.cliente_id, contratoId: r.contrato_id,
    competencia: r.competencia, categoria: r.categoria, descricao: r.descricao,
    quantidade: r.quantidade, valorUnitario: Number(r.valor_unitario),
    valorTotal: Number(r.valor_total), moeda: r.moeda,
    dataCriacao: r.data_criacao, observacoes: r.observacoes ?? undefined,
    origem: r.origem, statusAprovacao: r.status_aprovacao,
    movimentacaoId: r.movimentacao_id ?? undefined,
  };
}

export function mapWarehousePosition(r: any): WarehousePosition {
  return {
    id: r.id, code: r.code ?? r.id, warehouseId: r.warehouse_id, tipo: r.tipo ?? 'selectivo',
    rua: r.rua, bloco: r.bloco, nivel: r.nivel, posicao: r.posicao,
    status: r.status, palletId: r.pallet_id ?? undefined,
    clienteId: r.cliente_id ?? undefined, capacidadeKg: Number(r.capacidade_kg),
  };
}

export function mapWarehouse(r: any): Warehouse {
  return { id: r.id, code: r.code, name: r.name, city: r.city ?? '', address: r.address ?? '', notes: r.notes ?? '', active: r.active, pasillos: r.pasillos ?? '' };
}

export function mapSystemAlert(r: any): SystemAlert {
  return {
    id: r.id, tipo: r.tipo, mensaje: r.mensaje, fecha: r.fecha,
    clienteId: r.cliente_id ?? undefined, contratoId: r.contrato_id ?? undefined,
    resuelto: r.resuelto,
  };
}

export function mapClientRequest(r: any): ClientRequest {
  return {
    id: r.id, clienteId: r.cliente_id, palletIds: r.pallet_ids || [],
    tipo: r.tipo, horarioEstimado: r.horario_estimado, dataEstimada: r.data_estimada,
    margemTempo: r.margem_tempo, quantidade: r.quantidade ?? undefined,
    dataCriacao: r.data_criacao, status: r.status,
    operadorId: r.operador_id ?? undefined, movimentoIds: r.movimento_ids || [],
    observacoes: r.observacoes ?? undefined,
  };
}

export function mapExpense(r: any): Expense {
  return {
    id: r.id, competencia: r.competencia, categoria: r.categoria,
    descricao: r.descricao, valor: Number(r.valor), moeda: r.moeda,
    valorUSD: Number(r.valor_usd), cambioDia: r.cambio_dia ? Number(r.cambio_dia) : undefined,
    dataCriacao: r.data_criacao, dataVencimento: r.data_vencimento,
    status: r.status, observacoes: r.observacoes ?? undefined,
  };
}

// ============ Paginated fetch helper ============

async function fetchAll(table: string, orderCol: string, ascending = true) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase.from(table as any) as any)
      .select("*")
      .order(orderCol, { ascending })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`Error fetching ${table}:`, error);
      break;
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        from += PAGE_SIZE;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

// ============ Fetch all ============

export async function fetchAllData() {
  const [cl, co, pl, mv, ac, inv, ec, wp, sa, cr, ex] = await Promise.all([
    fetchAll("clients", "created_at"),
    fetchAll("contracts", "created_at"),
    fetchAll("pallets", "created_at"),
    fetchAll("movements", "data_hora", false),
    fetchAll("authorized_contacts", "created_at"),
    fetchAll("invoices", "created_at"),
    fetchAll("extra_costs", "created_at"),
    fetchAll("warehouse_positions", "id"),
    fetchAll("system_alerts", "created_at", false),
    fetchAll("client_requests", "data_criacao", false),
    fetchAll("expenses", "created_at"),
  ]);

  return {
    clients: cl.map(mapClient),
    contracts: co.map(mapContract),
    pallets: pl.map(mapPallet),
    movements: mv.map(mapMovement),
    authorizedContacts: ac.map(mapAuthorizedContact),
    invoices: inv.map(mapInvoice),
    extraCosts: ec.map(mapExtraCost),
    warehousePositions: wp.map(mapWarehousePosition),
    systemAlerts: sa.map(mapSystemAlert),
    clientRequests: cr.map(mapClientRequest),
    expenses: ex.map(mapExpense),
  };
}

// Operações de depósito: todas passam por funções do banco que gravam tudo ou nada.
import { supabase } from "@/integrations/supabase/client";
import { mapMovement, mapPallet } from "@/data/supabaseData";
import type { AuthorizedContact, Client, Contract, Movement, Pallet } from "@/data/types";
import { printLabels, printReceipt, type LabelData, type ReceiptData } from "@/lib/print/documents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function confirmMovement(params: { movementId: string; destino?: string; pesoFinal?: number; operador?: string; operadorId?: string }) {
  return call<{ success: boolean; movement_id: string; pallet_id: string; destino: string | null; destino2: string | null }>(
    "confirm_movement",
    {
      p_movement_id: params.movementId,
      p_destino: params.destino || null,
      p_peso_final: params.pesoFinal ?? null,
      p_operador: params.operador || null,
      p_operador_id: params.operadorId || null,
    },
  );
}

export function cancelMovement(movementId: string, motivo = "") {
  return call<{ success: boolean }>("cancel_movement", { p_movement_id: movementId, p_motivo: motivo });
}

// ---------------------------------------------------------------- Leitura de código

/** Normaliza o que a pistola ou a câmera leu (QR "SF-P:PL-000001", espaços, minúsculas) */
export function normalizeScan(raw: string): string {
  let v = (raw || "").trim().toUpperCase().replace(/\s+/g, "");
  v = v.replace(/^SF-P:/, "").replace(/^SF-POS:/, "");
  // Leitores com teclado em espanhol às vezes trocam "-" por "'" ou "?"
  v = v.replace(/[’'?]/g, "-");
  return v;
}

// Posição: "A-01-1-1" (código curto) ou "CDE1:A-01-1-1" (com depósito, como vem na etiqueta)
const POSITION_RE = /^([A-Z0-9]{2,8}:)?[A-Z]{1,2}-\d{2}-\d-\d$/;
export const isPositionCode = (code: string) => POSITION_RE.test(code);

/** Id completo da posição: se veio só o código curto, usa o depósito atual */
export function resolvePositionId(code: string, currentWarehouseCode: string | undefined): string {
  const c = normalizeScan(code);
  if (c.includes(":") || !currentWarehouseCode) return c;
  return `${currentWarehouseCode}:${c}`;
}

/** Busca um pallet pelo código lido (SKU). Prioriza pallets que ainda estão no depósito. */
export async function findPalletByCode(raw: string): Promise<Pallet | null> {
  const code = normalizeScan(raw);
  if (!code) return null;
  const { data, error } = await supabase
    .from("pallets")
    .select("*")
    .ilike("sku", code)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  const rows = (data || []).map(mapPallet);
  return rows.find((p) => p.status !== "expedido") || rows[0] || null;
}

/** Pallet que está numa posição do mapa (ao ler a etiqueta da prateleira) */
export async function findPalletByPosition(positionId: string): Promise<Pallet | null> {
  // (positionId já deve vir completo — use resolvePositionId antes)
  const { data, error } = await supabase.from("warehouse_positions").select("pallet_id").eq("id", positionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.pallet_id) return null;
  const { data: p, error: e2 } = await supabase.from("pallets").select("*").eq("id", data.pallet_id).maybeSingle();
  if (e2) throw new Error(e2.message);
  return p ? mapPallet(p) : null;
}

export async function fetchPallets(ids: string[]): Promise<Pallet[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("pallets").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return (data || []).map(mapPallet);
}

export async function fetchMovements(ids: string[]): Promise<Movement[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("movements").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return (data || []).map(mapMovement);
}

// ---------------------------------------------------------------- Impressão com dados atualizados

export interface PrintLookup {
  clients: Client[];
  contracts: Contract[];
  authorizedContacts: AuthorizedContact[];
}

export function labelFor(p: Pallet, lookup: PrintLookup): LabelData {
  const client = lookup.clients.find((c) => c.id === p.clienteId);
  const contract = lookup.contracts.find((c) => c.id === p.contratoId);
  return {
    pallet: {
      id: p.id,
      sku: p.sku,
      descricao: p.descricao,
      peso: p.peso,
      localizacao: p.localizacao,
      localizacao2: p.localizacao2,
      lote: p.lote,
      quantidade: p.quantidade,
      dataEntrada: p.dataEntrada,
      seguro: p.seguro,
      palletDuplo: p.palletDuplo,
      largo: p.largo,
      ancho: p.ancho,
      alto: p.alto,
    },
    clienteNome: client?.nomeFantasia || client?.razaoSocial || "",
    contratoNumero: contract?.numero,
  };
}

/**
 * Imprime o comprovante (e, se pedido, as etiquetas) relendo os dados do banco
 * depois da operação — assim a localização e o peso saem sempre atualizados.
 * Movimentos do mesmo tipo e cliente saem num comprovante único.
 */
export async function printMovements(movementIds: string[], lookup: PrintLookup, opts: { labels?: boolean } = {}) {
  const movements = await fetchMovements(movementIds);
  if (movements.length === 0) return;
  movements.sort((a, b) => movementIds.indexOf(a.id) - movementIds.indexOf(b.id));
  const pallets = await fetchPallets([...new Set(movements.map((m) => m.palletId))]);
  const byId = new Map(pallets.map((p) => [p.id, p]));

  const first = movements[0];
  const client = lookup.clients.find((c) => c.id === first.clienteId);
  const contract = lookup.contracts.find((c) => c.id === first.contratoId);
  const aut = first.autorizadoId ? lookup.authorizedContacts.find((a) => a.id === first.autorizadoId) : undefined;

  const receipt: ReceiptData = {
    tipo: first.tipo,
    movementIds: movements.map((m) => m.id),
    dataHora: first.dataHora,
    operador: first.operador.split(" — ")[0],
    clienteNome: client?.nomeFantasia || client?.razaoSocial || "",
    clienteDoc: client?.rucCnpj || undefined,
    contratoNumero: contract?.numero,
    autorizado: aut ? { nome: aut.nome, documento: `${aut.tipoDocumento} ${aut.documento}`.trim() } : undefined,
    motivo: first.motivo && first.motivo !== "Ingreso inicial" ? first.motivo : undefined,
    lines: movements.map((m) => {
      const p = byId.get(m.palletId);
      return {
        sku: p?.sku || shortPalletId(m.palletId),
        descricao: p?.descricao || "",
        peso: m.pesoInicial || p?.peso || 0,
        pesoFinal: m.pesoFinal || undefined,
        origem: m.tipo === "entrada" ? undefined : m.origemLocal,
        destino: m.tipo === "saida" ? undefined : m.destinoLocal,
      };
    }),
  };

  await printReceipt(receipt);

  if (opts.labels) {
    const labelPallets = movements.map((m) => byId.get(m.palletId)).filter((p): p is Pallet => !!p && p.status !== "expedido");
    if (labelPallets.length > 0) await printLabels(labelPallets.map((p) => labelFor(p, lookup)));
  }
}

const shortPalletId = (id: string) => (id || "").slice(0, 8).toUpperCase();

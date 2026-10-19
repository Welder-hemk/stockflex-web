import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TableName = 'clients' | 'contracts' | 'pallets' | 'movements' | 'authorized_contacts' | 'invoices' | 'extra_costs' | 'warehouse_positions' | 'system_alerts' | 'client_requests' | 'expenses' | 'warehouses' | 'contract_amendments';

const TABLE_ORDER: Record<TableName, { col: string; asc: boolean }> = {
  clients: { col: 'created_at', asc: true },
  contracts: { col: 'created_at', asc: true },
  pallets: { col: 'created_at', asc: true },
  movements: { col: 'data_hora', asc: false },
  authorized_contacts: { col: 'created_at', asc: true },
  invoices: { col: 'created_at', asc: true },
  extra_costs: { col: 'created_at', asc: true },
  warehouse_positions: { col: 'id', asc: true },
  system_alerts: { col: 'created_at', asc: false },
  client_requests: { col: 'data_criacao', asc: false },
  expenses: { col: 'created_at', asc: true },
  warehouses: { col: 'code', asc: true },
  contract_amendments: { col: 'created_at', asc: true },
};

async function fetchAllRows(table: TableName) {
  const PAGE_SIZE = 1000;
  const order = TABLE_ORDER[table];
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await (supabase.from(table as any) as any)
      .select("*")
      .order(order.col, { ascending: order.asc })
      .range(from, from + PAGE_SIZE - 1);

    // Erro de leitura não pode virar "lista vazia" silenciosa: a tela mostraria dados faltando
    if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`);
    if (data && data.length > 0) {
      allData = allData.concat(data);
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }
  return allData;
}

export function useTableQuery<T>(table: TableName, mapFn: (row: any) => T, enabled = true) {
  return useQuery<T[]>({
    queryKey: ['table', table],
    queryFn: async () => {
      const rows = await fetchAllRows(table);
      return rows.map(mapFn);
    },
    enabled,
  });
}

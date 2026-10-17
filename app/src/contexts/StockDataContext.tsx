import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import {
  mapClient, mapContract, mapPallet, mapAuthorizedContact,
  mapInvoice, mapExtraCost, mapWarehousePosition, mapSystemAlert,
  mapClientRequest, mapExpense, mapWarehouse,
} from "@/data/supabaseData";
import { useTableQuery } from "@/hooks/use-table-query";
import type {
  Client, Contract, Pallet, AuthorizedContact,
  Invoice, ExtraCost, WarehousePosition, SystemAlert, ClientRequest, Expense, Warehouse,
} from "@/data/types";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { toast } from "sonner";

export interface StockDataContextType {
  clients: Client[];
  contracts: Contract[];
  pallets: Pallet[];
  authorizedContacts: AuthorizedContact[];
  invoices: Invoice[];
  extraCosts: ExtraCost[];
  warehousePositions: WarehousePosition[];
  systemAlerts: SystemAlert[];
  clientRequests: ClientRequest[];
  expenses: Expense[];
  warehouses: Warehouse[];
  /** Depósito em que o usuário está trabalhando (operação e mapa) */
  currentWarehouseId: string;
  setCurrentWarehouseId: (id: string) => void;
  currentWarehouse: Warehouse | null;
  /** Posições só do depósito atual */
  currentPositions: WarehousePosition[];
  /** Mostrar o código do depósito junto da posição (só quando há mais de um) */
  multiWarehouse: boolean;
  loading: boolean;

  refresh: () => Promise<void>;
  refreshTable: (table: string) => void;

  totalCapacity: number;
  getOccupiedCount: () => number;
  getFreeCount: () => number;
  getBlockedCount: () => number;
  getReservedCount: () => number;
  /** Sugere posição livre no depósito atual (pesados no nível 1) */
  suggestPosition: (clienteId: string, peso?: number) => WarehousePosition | null;
  findContiguousPosition: (posId: string) => WarehousePosition | null;
  suggestContiguousPositions: (clienteId: string) => [WarehousePosition, WarehousePosition] | null;
  generatePalletCode: (clienteId?: string) => string;
}

const StockDataContext = createContext<StockDataContextType>({} as StockDataContextType);

export function StockDataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const enabled = isAuthenticated;

  // Realtime subscriptions for warehouse_positions and movements
  useRealtimeSync();

  const { data: clients = [], isLoading: l1 } = useTableQuery('clients', mapClient, enabled);
  const { data: contracts = [], isLoading: l2 } = useTableQuery('contracts', mapContract, enabled);
  const { data: pallets = [], isLoading: l3 } = useTableQuery('pallets', mapPallet, enabled);
  const { data: authorizedContacts = [], isLoading: l5 } = useTableQuery('authorized_contacts', mapAuthorizedContact, enabled);
  const { data: invoices = [], isLoading: l6 } = useTableQuery('invoices', mapInvoice, enabled);
  const { data: extraCosts = [], isLoading: l7 } = useTableQuery('extra_costs', mapExtraCost, enabled);
  const { data: warehousePositions = [], isLoading: l8 } = useTableQuery('warehouse_positions', mapWarehousePosition, enabled);
  const { data: systemAlerts = [], isLoading: l9 } = useTableQuery('system_alerts', mapSystemAlert, enabled);
  const { data: clientRequests = [], isLoading: l10 } = useTableQuery('client_requests', mapClientRequest, enabled);
  const { data: expenses = [], isLoading: l11 } = useTableQuery('expenses', mapExpense, enabled);
  const { data: warehouses = [], isLoading: l12 } = useTableQuery('warehouses', mapWarehouse, enabled);
  // Avisa uma vez se alguma tabela não carregou (antes o erro virava lista vazia em silêncio)
  const qcErr = queryClient;
  useEffect(() => {
    if (!enabled) return;
    const unsub = qcErr.getQueryCache().subscribe((ev) => {
      if (ev.type === 'updated' && ev.query.queryKey[0] === 'table' && ev.query.state.status === 'error' && ev.action.type === 'error') {
        toast.error('Error al cargar datos', { description: (ev.query.state.error as Error)?.message, id: `load-${String(ev.query.queryKey[1])}` });
      }
    });
    return unsub;
  }, [enabled, qcErr]);

  const loading = l1 || l2 || l3 || l5 || l6 || l7 || l8 || l9 || l10 || l11 || l12;

  // Depósito atual: lembrado neste aparelho; se não houver, o primeiro ativo
  const [currentWarehouseId, setCurrentWarehouseIdState] = useState<string>(() => {
    try { return localStorage.getItem("sf-warehouse") || ""; } catch { return ""; }
  });
  const activeWarehouses = useMemo(() => warehouses.filter(w => w.active), [warehouses]);
  useEffect(() => {
    if (activeWarehouses.length === 0) return;
    if (!activeWarehouses.some(w => w.id === currentWarehouseId)) setCurrentWarehouseIdState(activeWarehouses[0].id);
  }, [activeWarehouses, currentWarehouseId]);
  const setCurrentWarehouseId = useCallback((id: string) => {
    setCurrentWarehouseIdState(id);
    try { localStorage.setItem("sf-warehouse", id); } catch { /* ignora */ }
  }, []);
  const currentWarehouse = warehouses.find(w => w.id === currentWarehouseId) || null;
  const currentPositions = useMemo(
    () => (currentWarehouseId ? warehousePositions.filter(p => p.warehouseId === currentWarehouseId) : warehousePositions),
    [warehousePositions, currentWarehouseId],
  );
  const multiWarehouse = warehouses.length > 1;

  const refreshTable = useCallback((table: string) => {
    queryClient.invalidateQueries({ queryKey: ['table', table] });
  }, []);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['table'] });
  }, []);

  const totalCapacity = warehousePositions.length;
  const getOccupiedCount = useCallback(() => warehousePositions.filter(p => p.status === 'occupied').length, [warehousePositions]);
  const getFreeCount = useCallback(() => warehousePositions.filter(p => p.status === 'free').length, [warehousePositions]);
  const getBlockedCount = useCallback(() => warehousePositions.filter(p => p.status === 'blocked').length, [warehousePositions]);
  const getReservedCount = useCallback(() => warehousePositions.filter(p => p.status === 'reserved').length, [warehousePositions]);

  const suggestPosition = useCallback((clienteId: string, peso?: number): WarehousePosition | null => {
    // Só posições livres que aguentam o peso (o banco recusa acima da capacidade)
    const freePositions = currentPositions.filter(p => p.status === 'free' && (!peso || (p.capacidadeKg || 0) >= peso));
    const sortFn = (a: WarehousePosition, b: WarehousePosition) => {
      if (a.rua !== b.rua) return a.rua.localeCompare(b.rua, 'es', { numeric: true });
      if (a.bloco !== b.bloco) return a.bloco - b.bloco;
      if (a.nivel !== b.nivel) return a.nivel - b.nivel;
      return a.posicao - b.posicao;
    };
    // Pallets pesados: primeiro o nível do chão
    if (peso && peso > 1000) {
      const ground = freePositions.filter(p => p.nivel === 1).sort(sortFn);
      if (ground.length > 0) return ground[0];
    }
    // Perto dos pallets do mesmo cliente, quando houver
    const clientRuas = new Set(currentPositions.filter(p => p.clienteId === clienteId).map(p => p.rua));
    const sorted = freePositions.sort(sortFn);
    return sorted.find(p => clientRuas.has(p.rua)) || sorted[0] || null;
  }, [currentPositions]);

  const findContiguousPosition = useCallback((posId: string): WarehousePosition | null => {
    const pos = warehousePositions.find(p => p.id === posId);
    if (!pos) return null;
    const otherPos = pos.posicao === 1 ? 2 : 1;
    return warehousePositions.find(p => p.warehouseId === pos.warehouseId && p.rua === pos.rua && p.bloco === pos.bloco && p.nivel === pos.nivel && p.posicao === otherPos && p.status === 'free') || null;
  }, [warehousePositions]);

  const suggestContiguousPositions = useCallback((clienteId: string): [WarehousePosition, WarehousePosition] | null => {
    const clientPositions = currentPositions.filter(p => p.clienteId === clienteId);
    const clientRuas = [...new Set(clientPositions.map(p => p.rua))];
    const freePositions = currentPositions
      .filter(p => p.status === 'free')
      .sort((a, b) => {
        const aIn = clientRuas.includes(a.rua) ? 0 : 1;
        const bIn = clientRuas.includes(b.rua) ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return a.id.localeCompare(b.id);
      });
    for (const pos of freePositions) {
      const adj = findContiguousPosition(pos.id);
      if (adj) return [pos, adj];
    }
    return null;
  }, [currentPositions, findContiguousPosition]);

  const generatePalletCode = useCallback((): string => {
    let maxNum = 0;
    pallets.forEach(p => {
      const match = p.sku?.match(/^PL-(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });
    return `PL-${String(maxNum + 1).padStart(6, '0')}`;
  }, [pallets]);

  return (
    <StockDataContext.Provider value={{
      clients, contracts, pallets, authorizedContacts,
      invoices, extraCosts, warehousePositions, systemAlerts,
      clientRequests, expenses, warehouses, currentWarehouseId, setCurrentWarehouseId,
      currentWarehouse, currentPositions, multiWarehouse, loading, refresh, refreshTable,
      totalCapacity, getOccupiedCount, getFreeCount, getBlockedCount,
      getReservedCount, suggestPosition, findContiguousPosition,
      suggestContiguousPositions, generatePalletCode,
    }}>
      {children}
    </StockDataContext.Provider>
  );
}

export function useStockData() {
  return useContext(StockDataContext);
}

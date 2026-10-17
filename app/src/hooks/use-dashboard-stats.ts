import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardStats {
  occupied_count: number;
  free_count: number;
  blocked_count: number;
  reserved_count: number;
  total_positions: number;
  stored_pallets: number;
  total_pallets: number;
  active_contracts: number;
  expiring_contracts_30d: number;
  pending_requests: number;
  pending_movements: number;
}

export interface OccupancyByClient {
  client_id: string;
  client_name: string;
  contratadas: number;
  ocupadas: number;
  programadas: number;
  excedente: number;
}

export interface FinancialMonth {
  month: string;
  ingresos: number;
  gastos: number;
  resultado: number;
}

export function useDashboardStats(enabled = true) {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_stats');
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    enabled,
    staleTime: 30_000, // 30s for dashboard
  });
}

export function useDashboardOccupancy(enabled = true) {
  return useQuery<OccupancyByClient[]>({
    queryKey: ['dashboard', 'occupancy'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_occupancy_by_client');
      if (error) throw error;
      return (data as unknown as OccupancyByClient[]) || [];
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useDashboardFinancial(dateFrom?: string, dateTo?: string, enabled = true) {
  return useQuery<FinancialMonth[]>({
    queryKey: ['dashboard', 'financial', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_financial_summary', {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
      });
      if (error) throw error;
      return (data as unknown as FinancialMonth[]) || [];
    },
    enabled,
    staleTime: 60_000,
  });
}

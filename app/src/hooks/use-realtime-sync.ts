import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";

const TABLES = [
  'warehouse_positions', 'movements', 'pallets', 'clients',
  'contracts', 'invoices', 'expenses', 'extra_costs',
  'authorized_contacts', 'client_requests', 'system_alerts',
];

// Uma operação (ex.: saída) altera várias tabelas de uma vez. Juntamos os avisos
// num intervalo curto para recarregar cada tabela uma única vez.
const DEBOUNCE_MS = 500;

export function useRealtimeSync() {
  useEffect(() => {
    const pending = new Set<string>();
    let timer: number | undefined;

    const flush = () => {
      const tables = [...pending];
      pending.clear();
      tables.forEach((table) => {
        queryClient.invalidateQueries({ queryKey: ['table', table] });
        queryClient.invalidateQueries({ queryKey: ['paginated', table] });
      });
      if (tables.includes('movements')) queryClient.invalidateQueries({ queryKey: ['pending-movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-close'] });
    };

    let channel = supabase.channel('realtime-sync');
    TABLES.forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        pending.add(table);
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(flush, DEBOUNCE_MS);
      });
    });
    channel.subscribe();

    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);
}

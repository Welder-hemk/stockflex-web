
-- =========================================
-- 1. Fix warehouse_positions FKs to SET NULL
-- =========================================
ALTER TABLE public.warehouse_positions 
  DROP CONSTRAINT IF EXISTS warehouse_positions_pallet_id_fkey,
  DROP CONSTRAINT IF EXISTS warehouse_positions_cliente_id_fkey;

ALTER TABLE public.warehouse_positions
  ADD CONSTRAINT warehouse_positions_pallet_id_fkey 
    FOREIGN KEY (pallet_id) REFERENCES public.pallets(id) ON DELETE SET NULL,
  ADD CONSTRAINT warehouse_positions_cliente_id_fkey 
    FOREIGN KEY (cliente_id) REFERENCES public.clients(id) ON DELETE SET NULL;

-- =========================================
-- 2. Create indexes on frequently queried columns
-- =========================================

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_cliente_id ON public.contracts(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

-- pallets
CREATE INDEX IF NOT EXISTS idx_pallets_cliente_id ON public.pallets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pallets_contrato_id ON public.pallets(contrato_id);
CREATE INDEX IF NOT EXISTS idx_pallets_status ON public.pallets(status);

-- movements
CREATE INDEX IF NOT EXISTS idx_movements_cliente_id ON public.movements(cliente_id);
CREATE INDEX IF NOT EXISTS idx_movements_contrato_id ON public.movements(contrato_id);
CREATE INDEX IF NOT EXISTS idx_movements_pallet_id ON public.movements(pallet_id);
CREATE INDEX IF NOT EXISTS idx_movements_status ON public.movements(status);
CREATE INDEX IF NOT EXISTS idx_movements_data_hora ON public.movements(data_hora DESC);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_cliente_id ON public.invoices(cliente_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contrato_id ON public.invoices(contrato_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_competencia ON public.invoices(competencia);

-- extra_costs
CREATE INDEX IF NOT EXISTS idx_extra_costs_cliente_id ON public.extra_costs(cliente_id);
CREATE INDEX IF NOT EXISTS idx_extra_costs_contrato_id ON public.extra_costs(contrato_id);
CREATE INDEX IF NOT EXISTS idx_extra_costs_competencia ON public.extra_costs(competencia);

-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_competencia ON public.expenses(competencia);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

-- warehouse_positions
CREATE INDEX IF NOT EXISTS idx_warehouse_positions_status ON public.warehouse_positions(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_positions_cliente_id ON public.warehouse_positions(cliente_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_positions_pallet_id ON public.warehouse_positions(pallet_id);

-- authorized_contacts
CREATE INDEX IF NOT EXISTS idx_authorized_contacts_cliente_id ON public.authorized_contacts(cliente_id);

-- system_alerts
CREATE INDEX IF NOT EXISTS idx_system_alerts_resuelto ON public.system_alerts(resuelto);

-- session_logs
CREATE INDEX IF NOT EXISTS idx_session_logs_user_id ON public.session_logs(user_id);

-- client_requests
CREATE INDEX IF NOT EXISTS idx_client_requests_cliente_id ON public.client_requests(cliente_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_status ON public.client_requests(status);

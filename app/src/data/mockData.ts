// Backward-compatible re-exports from new data layer
// Pages that still import from here will get types + constants
// They should migrate to useStockData() for data access

export type {
  Client, Contract, Pallet, Movement, AuthorizedContact,
  Invoice, ExtraCost, ExtraCostCategory, WarehousePosition,
  SystemAlert, ClientRequest, CellStatus,
} from "@/data/types";

export {
  EXTRA_COST_CATEGORIES, isGroundPosition, positionCode, positionLabel,
} from "@/data/types";

// Stub - no longer needed, kept for compat
export function persistData() { /* no-op: use dbMutations + refresh() */ }
export function setDataChangeCallback(_cb: (() => void) | null) { /* no-op */ }
export function generatePalletCode(_clienteId?: string) { return 'PLT-0001'; }
export function suggestPosition(_clienteId?: string): any { return null; }
export function suggestContiguousPositions(_clienteId?: string): any { return null; }
export function findContiguousPosition(_posId?: string): any { return null; }
export const totalCapacity = 0;
export function getOccupiedCount() { return 0; }
export function getFreeCount() { return 0; }
export function getBlockedCount() { return 0; }
export function getReservedCount() { return 0; }

// Empty arrays - pages should use useStockData() instead
export const clients: any[] = [];
export const contracts: any[] = [];
export const pallets: any[] = [];
export const movements: any[] = [];
export const authorizedContacts: any[] = [];
export const invoices: any[] = [];
export const extraCosts: any[] = [];
export const warehousePositions: any[] = [];
export const systemAlerts: any[] = [];
export const clientRequests: any[] = [];

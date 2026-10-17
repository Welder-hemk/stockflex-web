// Backward-compatible re-exports
export type { Expense, ExpenseCategory, ExpenseStatus } from "@/data/types";
export { EXPENSE_CATEGORIES } from "@/data/types";
export function persistExpenses() { /* no-op */ }
export const expenses: any[] = [];

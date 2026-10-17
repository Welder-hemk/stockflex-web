import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PaginationFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in';
  value: any;
}

export interface TextSearch {
  term: string;
  columns: string[];
}

export interface UsePaginatedQueryResult<T> {
  data: T[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  refresh: () => void;
}

type ValidTable = 'movements' | 'pallets' | 'invoices' | 'clients' | 'contracts' | 'authorized_contacts' | 'extra_costs' | 'expenses';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function usePaginatedQuery<T = any>(
  table: ValidTable,
  filters: PaginationFilter[] = [],
  orderBy: { column: string; ascending: boolean } = { column: 'created_at', ascending: false },
  initialPageSize = 25,
  textSearch?: TextSearch,
): UsePaginatedQueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Reset to page 1 when filters change
  const filtersKey = JSON.stringify(filters);
  const searchKey = textSearch ? `${textSearch.term}|${textSearch.columns.join(',')}` : '';
  useEffect(() => {
    setPage(1);
  }, [filtersKey, searchKey]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPage() {
      setLoading(true);
      setError(null);

      try {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = (supabase.from(table as any) as any)
          .select('*', { count: 'exact' });

        // Apply filters
        for (const f of filters) {
          if (f.value === undefined || f.value === null || f.value === '' || f.value === 'all') continue;
          switch (f.operator) {
            case 'eq': query = query.eq(f.column, f.value); break;
            case 'neq': query = query.neq(f.column, f.value); break;
            case 'gt': query = query.gt(f.column, f.value); break;
            case 'gte': query = query.gte(f.column, f.value); break;
            case 'lt': query = query.lt(f.column, f.value); break;
            case 'lte': query = query.lte(f.column, f.value); break;
            case 'like': query = query.like(f.column, f.value); break;
            case 'ilike': query = query.ilike(f.column, f.value); break;
            case 'in': query = query.in(f.column, f.value); break;
          }
        }

        // Apply text search (OR across columns with ilike)
        if (textSearch && textSearch.term.trim()) {
          const orClause = textSearch.columns
            .map(col => `${col}.ilike.%${textSearch.term.trim()}%`)
            .join(',');
          query = query.or(orClause);
        }

        query = query.order(orderBy.column, { ascending: orderBy.ascending });
        query = query.range(from, to);

        const { data: rows, error: err, count } = await query;

        if (cancelled) return;
        if (err) throw err;

        setData(rows || []);
        setTotalCount(count ?? 0);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Error loading data');
          setData([]);
          setTotalCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPage();
    return () => { cancelled = true; };
  }, [table, filtersKey, searchKey, orderBy.column, orderBy.ascending, page, pageSize, refreshKey]);

  return {
    data,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    page,
    pageSize,
    loading,
    error,
    setPage,
    setPageSize,
    refresh,
  };
}

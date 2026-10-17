import { useState, useMemo } from "react";

export function useSortableTable<T>(data: T[], defaultField: string = '', defaultDirection: 'asc' | 'desc' = 'asc') {
  const [sortField, setSortField] = useState(defaultField);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultDirection);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortData = (getValue: (item: T, field: string) => string | number) => {
    if (!sortField) return data;
    return [...data].sort((a, b) => {
      const aVal = getValue(a, sortField);
      const bVal = getValue(b, sortField);
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  };

  return { sortField, sortDirection, toggleSort, sortData };
}

/**
 * Formats a number using dot as thousands separator and comma as decimal separator.
 * Examples:
 *   formatNumber(1234.56)     → "1.234,56"
 *   formatNumber(1234.5, 2)   → "1.234,50"
 *   formatNumber(1234)        → "1.234"
 *   formatNumber(1234, 2)     → "1.234,00"
 */
export function formatNumber(value: number, decimals?: number): string {
  const fixed = decimals !== undefined ? value.toFixed(decimals) : String(value);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${formattedInt},${decPart}` : formattedInt;
}

/**
 * Formats a currency value: "USD 1.234,56"
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  return `${currency} ${formatNumber(value, 2)}`;
}

/** "US$ 1.234,56" (negativos: "− US$ 20,00") */
export function formatMoney(value: number | null | undefined, currency: string = 'USD'): string {
  const v = Number(value || 0);
  const sym = currency === 'USD' ? 'US$' : currency === 'PYG' ? '₲' : currency === 'BRL' ? 'R$' : currency;
  const abs = currency === 'PYG' ? formatNumber(Math.round(Math.abs(v))) : formatNumber(Math.abs(v), 2);
  return `${v < 0 ? '− ' : ''}${sym} ${abs}`;
}

/**
 * Lê número digitado no padrão paraguaio/brasileiro ou internacional:
 * "1.234,56" → 1234.56 · "2,5" → 2.5 · "2.5" → 2.5 · "1.200" → 1200 · "" → NaN
 */
export function parseDecimal(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim().replace(/\s/g, '').replace(/^(US\$|USD|₲|R\$)/i, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // o separador que aparece por último é o decimal
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    // "1.200" (milhar) vs "2.5" (decimal): 3 dígitos após um único ponto = milhar
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== '0')) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

/** Mostra número para edição: 2.5 → "2,5" */
export const toInputDecimal = (n: number | null | undefined) => (n === null || n === undefined || isNaN(Number(n)) ? '' : String(n).replace('.', ','));

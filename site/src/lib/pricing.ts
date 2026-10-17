// =====================================================================
// Tabela de preços StockFlex — ÚNICO lugar onde os valores são definidos.
// Alterou um valor? O simulador e a proposta em PDF passam a usá-lo.
// =====================================================================

export const PRICING = {
  currency: "USD",
  /** Pallet padrão: 1,2 × 1,0 × 1,5 m */
  standard: { length: 1.2, width: 1.0, height: 1.5 },
  /** Maior pallet aceito numa posição (acima disso: sob consulta) */
  max: { length: 1.2, width: 1.0, height: 1.8 },
  /** Preço base por posição/mês conforme a quantidade total de posições */
  quantityTiers: [
    { from: 1, to: 79, price: 8.0 },
    { from: 80, to: 100, price: 7.5 },
    { from: 101, to: Infinity, price: 7.0 },
  ],
  /** Adicional por pallet fora do padrão (US$/mês por posição) */
  oversizeFee: 1.0,
  /** Adicional por quantidade pequena (US$/mês por posição) */
  smallQuantity: { below: 10, fee: 1.0 },
  /** Adicional por prazo de contrato (US$/mês por posição) */
  termTiers: [
    { fromMonths: 12, fee: 0 },
    { fromMonths: 6, fee: 0.5 },
    { fromMonths: 3, fee: 1.0 },
    { fromMonths: 1, fee: 1.5 },
  ],
  /** Seguro: % do valor declarado por mês */
  insuranceMonthlyRate: 0.0003,
  /** Movimentos inclusos por posição/mês (não acumulam; no mês de entrada/saída, a própria entrada/saída consome o incluso) */
  includedMovementsPerPosition: 1,
  /** Movimento extra (US$ por movimento) */
  extraMovementPrice: 4.0,
  /** Os preços já incluem IVA */
  vatIncluded: true,
  /** Validade da proposta, em dias */
  validityDays: 15,
} as const;

export interface PalletLine {
  quantity: number;
  length: number; // m
  width: number; // m
  height: number; // m
  /** Valor declarado por pallet (USD) — para o seguro */
  declaredValue?: number;
}

export interface LineQuote {
  line: PalletLine;
  volume: number; // m³
  volumeFactor: number; // ≥ 1
  oversize: boolean;
  fitsPosition: boolean;
  basePrice: number; // base da faixa × fator de volume
  oversizeFee: number;
  smallQuantityFee: number;
  termFee: number;
  pricePerPosition: number; // US$/mês
  rentMonthly: number;
  insuranceMonthly: number;
}

export interface Quote {
  lines: LineQuote[];
  totalPositions: number;
  months: number;
  tierPrice: number;
  smallQuantityFee: number;
  termFee: number;
  rentMonthly: number;
  insuranceMonthly: number;
  totalMonthly: number;
  totalContract: number;
  /** Alguma linha passa da medida máxima → precisa de consulta */
  needsConsultation: boolean;
  /** Linhas fora da medida máxima (não precificadas) */
  consultLines: PalletLine[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const STANDARD_VOLUME = PRICING.standard.length * PRICING.standard.width * PRICING.standard.height;

export function tierPriceFor(totalPositions: number): number {
  const t = PRICING.quantityTiers.find((x) => totalPositions >= x.from && totalPositions <= x.to);
  return t ? t.price : PRICING.quantityTiers[0].price;
}

export function termFeeFor(months: number): number {
  const m = Math.max(1, Math.floor(months || 1));
  return (PRICING.termTiers.find((x) => m >= x.fromMonths) ?? PRICING.termTiers.at(-1)!).fee;
}

export function smallQuantityFeeFor(totalPositions: number): number {
  return totalPositions > 0 && totalPositions < PRICING.smallQuantity.below ? PRICING.smallQuantity.fee : 0;
}

export function fitsPosition(l: PalletLine): boolean {
  // A base pode ser girada (1,0 × 1,2): compara o maior lado com 1,2 e o menor com 1,0
  const big = Math.max(l.length, l.width);
  const small = Math.min(l.length, l.width);
  return big <= PRICING.max.length + 1e-9 && small <= PRICING.max.width + 1e-9 && l.height <= PRICING.max.height + 1e-9;
}

export function isOversize(l: PalletLine): boolean {
  return l.length * l.width * l.height > STANDARD_VOLUME + 1e-9;
}

export function quote(lines: PalletLine[], months: number): Quote {
  const all = lines.filter((l) => l.quantity > 0 && l.length > 0 && l.width > 0 && l.height > 0);
  // Pallet acima da medida máxima não entra no preço: vai como "sob consulta"
  const consultLines = all.filter((l) => !fitsPosition(l));
  const valid = all.filter((l) => fitsPosition(l));
  const totalPositions = valid.reduce((s, l) => s + Math.floor(l.quantity), 0);
  const m = Math.max(1, Math.floor(months || 1));
  const tierPrice = tierPriceFor(totalPositions);
  const smallFee = smallQuantityFeeFor(totalPositions);
  const termFee = termFeeFor(m);

  const lq: LineQuote[] = valid.map((line) => {
    const volume = line.length * line.width * line.height;
    // Pallet menor que o padrão paga o padrão; maior paga proporcional ao volume
    const volumeFactor = Math.max(1, volume / STANDARD_VOLUME);
    const oversize = isOversize(line);
    const basePrice = round2(tierPrice * volumeFactor);
    const oFee = oversize ? PRICING.oversizeFee : 0;
    const pricePerPosition = round2(basePrice + oFee + smallFee + termFee);
    const qty = Math.floor(line.quantity);
    return {
      line,
      volume: round2(volume),
      volumeFactor: Math.round(volumeFactor * 1000) / 1000,
      oversize,
      fitsPosition: fitsPosition(line),
      basePrice,
      oversizeFee: oFee,
      smallQuantityFee: smallFee,
      termFee,
      pricePerPosition,
      rentMonthly: round2(pricePerPosition * qty),
      insuranceMonthly: round2((line.declaredValue || 0) * qty * PRICING.insuranceMonthlyRate),
    };
  });

  const rentMonthly = round2(lq.reduce((s, x) => s + x.rentMonthly, 0));
  const insuranceMonthly = round2(lq.reduce((s, x) => s + x.insuranceMonthly, 0));
  const totalMonthly = round2(rentMonthly + insuranceMonthly);
  return {
    lines: lq,
    totalPositions,
    months: m,
    tierPrice,
    smallQuantityFee: smallFee,
    termFee,
    rentMonthly,
    insuranceMonthly,
    totalMonthly,
    totalContract: round2(totalMonthly * m),
    needsConsultation: consultLines.length > 0,
    consultLines,
  };
}

/** Número da proposta: SF-AAAAMMDD-XXXX (data no fuso de Assunção) */
export function proposalNumber(date = new Date()): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SF-${d}-${rand}`;
}

export const money = (n: number, lang: string) =>
  `US$ ${n.toLocaleString(lang === "pt" ? "pt-BR" : "es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

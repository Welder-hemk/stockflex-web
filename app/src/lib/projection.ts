// Modelo de proyección financiera de StockFlex (mismo cálculo del simulador "Projeção StockFlex").
// Valores en US$, salvo segInv y monit en G$.

export interface ProjectionParams {
  nBarr: number; interv: number;
  posEst: number; posPiso: number; preco: number; extra: number; iva: number;
  occIni: number; occAlvo: number; rampa: number;
  custoPos: number; estCaixa: boolean; apil: number; segInv: number; outroInv: number; giro: number;
  aluguel: number; salario: number; pessoas: number; monit: number; outros: number; varPos: number;
  cambio: number; ire: number; depEst: number; depApil: number; depEq: number; tma: number; horiz: number;
}

export const DEFAULT_PARAMS: ProjectionParams = {
  nBarr: 1, interv: 12, posEst: 780, posPiso: 76, preco: 7, extra: 0, iva: 10,
  occIni: 20, occAlvo: 85, rampa: 12,
  custoPos: 25, estCaixa: false, apil: 14000, segInv: 5_000_000, outroInv: 0, giro: 2,
  aluguel: 2000, salario: 400, pessoas: 1, monit: 150_000, outros: 150, varPos: 0,
  cambio: 7300, ire: 10, depEst: 15, depApil: 5, depEq: 5, tma: 12, horiz: 60,
};

type Field = { key: keyof ProjectionParams; label: string; hint?: string; unit: string; step?: number; checkbox?: boolean };
export const PARAM_GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Escala de la operación", fields: [
    { key: "nBarr", label: "Depósitos", hint: "cada uno repite posiciones, alquiler, equipo, apiladora y seguridad", unit: "un", step: 1 },
    { key: "interv", label: "Intervalo de apertura", hint: "meses entre un depósito y el siguiente", unit: "m", step: 1 },
  ] },
  { title: "Capacidad e ingresos (por depósito)", fields: [
    { key: "posEst", label: "Posiciones en estructura", unit: "pos", step: 1 },
    { key: "posPiso", label: "Posiciones en piso", unit: "pos", step: 1 },
    { key: "preco", label: "Precio por pallet/mes", hint: "con IVA", unit: "US$", step: 0.25 },
    { key: "extra", label: "Ingreso extra por pallet/mes", hint: "movimientos extra, seguro, servicios", unit: "US$", step: 0.25 },
    { key: "iva", label: "IVA incluido en el precio", unit: "%", step: 1 },
  ] },
  { title: "Ocupación", fields: [
    { key: "occIni", label: "Ocupación inicial (mes 1)", unit: "%", step: 1 },
    { key: "occAlvo", label: "Ocupación en régimen", unit: "%", step: 1 },
    { key: "rampa", label: "Meses hasta el régimen", unit: "m", step: 1 },
  ] },
  { title: "Inversión inicial (por depósito)", fields: [
    { key: "custoPos", label: "Estructura por posición", hint: "solo posiciones en estructura", unit: "US$", step: 0.5 },
    { key: "estCaixa", label: "La estructura sale de caja", hint: "desmarcado = recibida como pago de deuda", unit: "", checkbox: true },
    { key: "apil", label: "Apiladora", unit: "US$", step: 100 },
    { key: "segInv", label: "Sistema de seguridad", unit: "G$", step: 100000 },
    { key: "outroInv", label: "Otras inversiones", hint: "obras, piso, etiquetas, TI", unit: "US$", step: 100 },
    { key: "giro", label: "Capital de giro", hint: "meses de costo fijo en caja", unit: "m", step: 1 },
  ] },
  { title: "Costos fijos mensuales (por depósito)", fields: [
    { key: "aluguel", label: "Alquiler del depósito", unit: "US$", step: 50 },
    { key: "salario", label: "Salario por persona", hint: "con cargas sociales", unit: "US$", step: 10 },
    { key: "pessoas", label: "Personas", unit: "un", step: 1 },
    { key: "monit", label: "Monitoreo", unit: "G$", step: 10000 },
    { key: "outros", label: "Otros costos", hint: "energía, internet, sistema, seguro del depósito (no se repite por depósito)", unit: "US$", step: 10 },
    { key: "varPos", label: "Costo variable por pallet", unit: "US$", step: 0.05 },
  ] },
  { title: "Finanzas", fields: [
    { key: "cambio", label: "Cambio G$ por US$", unit: "G$", step: 50 },
    { key: "ire", label: "Impuesto a la renta (IRE)", unit: "%", step: 1 },
    { key: "depEst", label: "Depreciación estructura", unit: "años", step: 1 },
    { key: "depApil", label: "Depreciación apiladora", unit: "años", step: 1 },
    { key: "depEq", label: "Depreciación seguridad y otros", unit: "años", step: 1 },
    { key: "tma", label: "Tasa de descuento (VPN)", unit: "%aa", step: 1 },
    { key: "horiz", label: "Horizonte", unit: "m", step: 12 },
  ] },
];

export interface MonthRow {
  m: number; occ: number; pal: number; cap: number; nB: number;
  rec: number; custo: number; ebitda: number; dep: number; ire: number; ll: number; fc: number; acum: number; inv: number;
}

export interface ProjectionResult {
  N: number; cap: number; cap1: number; precoLiq: number; precoBruto: number;
  fixo: number; fixo1: number; outros: number; dep: number; depEst: number; depApil: number; depOut: number;
  invEst: number; invSeg: number; invCaixa: number; giro: number; invTotalContabil: number; i0: number; iTot: number;
  ms: MonthRow[];
  palR: number; recR: number; custoR: number; ebitdaR: number; ireR: number; llR: number;
  be: number; beDep: number; payback: number | null; vpl: number; tir: number | null; roiAno: number; H: number;
}

/** Ocupación del mes k de vida de un depósito (rampa lineal). */
export const occAt = (p: ProjectionParams, k: number) => {
  const oi = p.occIni / 100, oa = p.occAlvo / 100, R = Math.max(1, p.rampa);
  return k >= R ? oa : oi + (oa - oi) * (k - 1) / Math.max(1, R - 1);
};

export function runProjection(p: ProjectionParams): ProjectionResult {
  const N = Math.max(1, Math.round(p.nBarr)), interv = Math.max(0, Math.round(p.interv));
  const cap1 = p.posEst + p.posPiso, cambio = Math.max(1, p.cambio);
  const invEst1 = p.posEst * p.custoPos;
  const invSeg1 = p.segInv / cambio;
  const fixo1 = p.aluguel + p.salario * p.pessoas + p.monit / cambio;
  const outros = p.outros;
  const invCaixa1 = (p.estCaixa ? invEst1 : 0) + p.apil + invSeg1 + p.outroInv;
  const giro1 = (fixo1 + outros) * p.giro;
  const invContabil1 = invEst1 + p.apil + invSeg1 + p.outroInv;
  const depEst1 = invEst1 / (Math.max(1, p.depEst) * 12), depApil1 = p.apil / (Math.max(1, p.depApil) * 12), depOut1 = (invSeg1 + p.outroInv) / (Math.max(1, p.depEq) * 12);
  const dep1 = depEst1 + depApil1 + depOut1;
  const precoBruto = p.preco + p.extra;
  const precoLiq = precoBruto / (1 + p.iva / 100);
  const H = Math.max(12, Math.round(p.horiz));
  const start = (b: number) => 1 + b * interv;

  const ms: MonthRow[] = [];
  let acum = -(invCaixa1 + giro1);
  let payback: number | null = null;
  let giroTot = giro1, invCaixaTot = invCaixa1;
  const flows = [-(invCaixa1 + giro1)];
  for (let m = 1; m <= H; m++) {
    let pal = 0, cap = 0, nB = 0;
    for (let b = 0; b < N; b++) { const s = start(b); if (m < s) continue; nB++; cap += cap1; pal += Math.round(cap1 * occAt(p, m - s + 1)); }
    const fixo = fixo1 * nB + outros, dep = dep1 * nB;
    const rec = pal * precoLiq, custo = fixo + pal * p.varPos;
    const ebitda = rec - custo, ebt = ebitda - dep, ire = Math.max(0, ebt) * p.ire / 100, ll = ebt - ire;
    let inv = 0;
    for (let b = 1; b < N; b++) if (start(b) === m) { inv += invCaixa1 + giro1; giroTot += giro1; invCaixaTot += invCaixa1; }
    const fc = ebitda - ire - inv;
    acum += fc;
    if (payback === null && acum >= 0 && m >= start(N - 1)) payback = m;
    flows.push(fc);
    ms.push({ m, occ: cap ? pal / cap : 0, pal, cap, nB, rec, custo, ebitda, dep, ire, ll, fc, acum, inv });
  }
  flows[flows.length - 1] += giroTot;

  const cap = cap1 * N, fixo = fixo1 * N + outros, dep = dep1 * N;
  const palR = Math.round(cap1 * p.occAlvo / 100) * N, recR = palR * precoLiq, custoR = fixo + palR * p.varPos;
  const ebitdaR = recR - custoR, ebtR = ebitdaR - dep, ireR = Math.max(0, ebtR) * p.ire / 100, llR = ebtR - ireR;
  const mc = precoLiq - p.varPos;
  const be = mc > 0 ? Math.ceil(fixo / mc) : Infinity, beDep = mc > 0 ? Math.ceil((fixo + dep) / mc) : Infinity;
  const r = Math.pow(1 + p.tma / 100, 1 / 12) - 1;
  const npv = (rate: number) => flows.reduce((s, f, k) => s + f / Math.pow(1 + rate, k), 0);
  const vpl = npv(r);
  let tir: number | null = null;
  const i0 = invCaixa1 + giro1, iTot = invCaixaTot + giroTot;
  if (iTot > 0 && npv(0) > 0) { let lo = 0, hi = 1; for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; } tir = Math.pow(1 + lo, 12) - 1; }
  const roiAno = iTot > 0 ? llR * 12 / iTot : Infinity;
  return {
    N, cap, cap1, precoLiq, precoBruto, fixo, fixo1, outros, dep, depEst: depEst1 * N, depApil: depApil1 * N, depOut: depOut1 * N,
    invEst: invEst1 * N, invSeg: invSeg1 * N, invCaixa: invCaixaTot, giro: giroTot, invTotalContabil: invContabil1 * N, i0, iTot,
    ms, palR, recR, custoR, ebitdaR, ireR, llR, be, beDep, payback, vpl, tir, roiAno, H,
  };
}

/** Completa parámetros guardados con los valores por defecto (para escenarios viejos). */
export const normalizeParams = (raw: Partial<ProjectionParams> | null | undefined): ProjectionParams => {
  const out = { ...DEFAULT_PARAMS };
  for (const k of Object.keys(DEFAULT_PARAMS) as (keyof ProjectionParams)[]) {
    const v = raw?.[k];
    if (typeof DEFAULT_PARAMS[k] === 'boolean') { if (typeof v === 'boolean') (out[k] as boolean) = v; }
    else if (typeof v === 'number' && Number.isFinite(v)) (out[k] as number) = v;
  }
  return out;
};

// ---------- Comparación con lo real ----------

export interface ActualMonth {
  periodo: string; posiciones: number; pallets_promedio: number; pallets_pico: number;
  facturado: number; cobrado: number; gastos: number; gastos_cac: number; inversiones: number;
  gastos_categoria: Record<string, number>;
}

/** "2026-07" + n meses */
export const addMonths = (per: string, n: number) => {
  const [y, m] = per.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export interface CompareRow {
  periodo: string; m: number; plan: MonthRow | undefined;
  /** Caja acumulada del plan sin el capital de giro (comparable con la caja real). */
  planCaja: number | null;
  occReal: number; palReal: number; recReal: number; costoReal: number; ebitdaReal: number;
  cobrado: number; inversiones: number; cajaMes: number; cajaAcum: number;
  precioReal: number | null;
}

/**
 * Real mes a mes, alineado con el escenario.
 * Caja real = cobrado − gastos − inversiones, acumulado desde el inicio (incluye el capital de giro implícito en la caja).
 * La capacidad del plan es la referencia de ocupación (posiciones del escenario).
 */
/** Caja acumulada del plan sin el capital de giro (que queda en caja, no se gasta). */
export const planCashNoGiro = (params: ProjectionParams, plan: ProjectionResult, row: MonthRow) =>
  row.acum + (plan.fixo1 + plan.outros) * params.giro * Math.max(1, row.nB);

/** Primer mes en que la caja del plan (sin capital de giro) vuelve a cero. */
export const planPaybackNoGiro = (params: ProjectionParams, plan: ProjectionResult) =>
  plan.ms.find((r) => r.m >= 1 + (plan.N - 1) * Math.round(params.interv) && planCashNoGiro(params, plan, r) >= 0)?.m ?? null;

export function compare(params: ProjectionParams, plan: ProjectionResult, inicio: string, actuals: ActualMonth[]): CompareRow[] {
  let acum = 0;
  return actuals.map((a) => {
    const m = monthsBetween(inicio, a.periodo) + 1;
    const p = plan.ms[m - 1];
    const recReal = a.facturado / (1 + params.iva / 100);
    const costoReal = a.gastos;
    const cajaMes = a.cobrado - a.gastos - a.inversiones;
    acum += cajaMes;
    const capRef = p?.cap || plan.cap1;
    return {
      periodo: a.periodo, m, plan: p, planCaja: p ? planCashNoGiro(params, plan, p) : null,
      occReal: capRef ? a.pallets_promedio / capRef : 0,
      palReal: a.pallets_promedio,
      recReal, costoReal, ebitdaReal: recReal - costoReal,
      cobrado: a.cobrado, inversiones: a.inversiones, cajaMes, cajaAcum: acum,
      precioReal: a.pallets_promedio > 0 ? recReal / a.pallets_promedio : null,
    };
  });
}

export interface Reforecast {
  desde: number; // mes del plan desde el que se proyecta
  rows: { m: number; occ: number; rec: number; costo: number; acum: number }[];
  payback: number | null;
  precioUsado: number; costoUsado: number; occInicial: number;
}

/**
 * Proyección actualizada: parte de la caja real acumulada y de la ocupación real del último mes,
 * y crece al mismo ritmo mensual que el escenario hasta la ocupación de régimen. Precio neto y costo fijo:
 * promedio real de los últimos 3 meses con datos (si no hay, los del escenario).
 * Considera 1 depósito (los siguientes del escenario se suman en los meses de apertura).
 */
export function reforecast(params: ProjectionParams, plan: ProjectionResult, rows: CompareRow[]): Reforecast | null {
  const withData = rows.filter((r) => r.m >= 1);
  if (!withData.length) return null;
  const last = withData[withData.length - 1];
  const recent = withData.slice(-3);
  const priced = recent.filter((r) => r.precioReal !== null && r.palReal > 0);
  const precioUsado = priced.length ? priced.reduce((s, r) => s + (r.precioReal as number), 0) / priced.length : plan.precoLiq;
  const costed = recent.filter((r) => r.costoReal > 0);
  const costoUsado = costed.length ? costed.reduce((s, r) => s + r.costoReal, 0) / costed.length : plan.fixo1 + plan.outros;
  const occInicial = last.occReal;
  const target = params.occAlvo / 100;
  // Mismo ritmo de crecimiento del escenario (puntos de ocupación por mes), partiendo de la ocupación real.
  const slope = Math.max(0, (params.occAlvo - params.occIni) / 100 / Math.max(1, params.rampa - 1));
  let acum = last.cajaAcum;
  let payback: number | null = acum >= 0 && last.m >= 1 ? last.m : null;
  const out: Reforecast['rows'] = [];
  for (let m = last.m + 1; m <= plan.H; m++) {
    const k = m - last.m;
    const occ = occInicial >= target ? occInicial : Math.min(target, occInicial + slope * k);
    const p = plan.ms[m - 1];
    const extraDepositos = p ? Math.max(0, p.nB - 1) : 0;
    const cap1 = plan.cap1;
    const palBase = Math.round(cap1 * occ);
    const palExtra = p ? Math.max(0, p.pal - Math.round(cap1 * occAt(params, m))) : 0;
    const pal = palBase + (extraDepositos ? palExtra : 0);
    const rec = pal * precioUsado;
    const costo = costoUsado + extraDepositos * plan.fixo1 + pal * params.varPos;
    const ebitda = rec - costo;
    const ire = Math.max(0, ebitda - (p?.dep ?? plan.dep)) * params.ire / 100;
    acum += ebitda - ire - (p?.inv ?? 0);
    if (payback === null && acum >= 0) payback = m;
    out.push({ m, occ, rec, costo, acum });
  }
  return { desde: last.m, rows: out, payback, precioUsado, costoUsado, occInicial };
}

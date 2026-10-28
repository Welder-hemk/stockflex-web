// Proyección financiera: simulador con escenarios guardados + comparación real vs. plan.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Copy, Info, Loader2, RotateCcw, Save, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber, parseDecimal } from "@/lib/formatters";
import { monthLocal } from "@/lib/dates";
import { periodLabel } from "@/data/billing";
import { deleteScenario, fetchActuals, fetchScenarios, saveScenario, setBaseScenario, type Scenario } from "@/data/projection";
import {
  addMonths, compare, DEFAULT_PARAMS, PARAM_GROUPS, planCashNoGiro, planPaybackNoGiro, reforecast, runProjection,
  type ProjectionParams, type ProjectionResult,
} from "@/lib/projection";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const C = {
  real: "hsl(var(--primary))",
  plan: "hsl(var(--muted-foreground))",
  good: "hsl(var(--success))",
  bad: "hsl(var(--destructive))",
  warn: "hsl(var(--warning))",
};
const usd0 = (n: number) => `${n < 0 ? "− " : ""}US$ ${formatNumber(Math.round(Math.abs(n)))}`;
const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !isFinite(n) ? "—" : `${formatNumber(n * 100, d)}%`);
const kfmt = (n: number) => (Math.abs(n) >= 1000 ? `${formatNumber(n / 1000, Math.abs(n) >= 10000 ? 0 : 1)}k` : formatNumber(Math.round(n)));
const shortMonth = (per: string) => { const s = periodLabel(per); const [m, y] = s.split(" "); return `${m.slice(0, 3)} ${y?.slice(2)}`; };
const variance = (real: number, plan: number) => (plan ? (real - plan) / Math.abs(plan) : null);

// ---------- piezas de interfaz ----------

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail?: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-destructive", tone === "warn" && "text-warning")}>{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function NumField({ id, value, onChange, unit, step }: { id: string; value: number; onChange: (v: number) => void; unit: string; step?: number }) {
  const [text, setText] = useState(String(value).replace(".", ","));
  useEffect(() => { setText((t) => (parseDecimal(t) === value ? t : String(value).replace(".", ","))); }, [value]);
  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        inputMode="decimal"
        className="h-8 w-28 text-right font-mono text-sm"
        value={text}
        onChange={(e) => { setText(e.target.value); const n = parseDecimal(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        onKeyDown={(e) => {
          if (!step || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          const n = Math.max(0, Math.round((value + (e.key === "ArrowUp" ? step : -step)) * 1000) / 1000);
          onChange(n); setText(String(n).replace(".", ","));
        }}
      />
      <span className="w-8 text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function ParamsForm({ params, onChange }: { params: ProjectionParams; onChange: (p: ProjectionParams) => void }) {
  return (
    <div className="space-y-5">
      {PARAM_GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</legend>
          <div className="space-y-1.5">
            {g.fields.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <label htmlFor={`p-${f.key}`} className="min-w-0 flex-1 text-sm leading-tight">
                  {f.label}
                  {f.hint && <span className="block text-[11px] text-muted-foreground">{f.hint}</span>}
                </label>
                {f.checkbox ? (
                  <Checkbox id={`p-${f.key}`} checked={params[f.key] as boolean} onCheckedChange={(v) => onChange({ ...params, [f.key]: !!v })} className="mr-10" />
                ) : (
                  <NumField id={`p-${f.key}`} value={params[f.key] as number} unit={f.unit} step={f.step} onChange={(v) => onChange({ ...params, [f.key]: v })} />
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

// ---------- vista: simulador ----------

function SimulatorView({ params, R, inicio }: { params: ProjectionParams; R: ProjectionResult; inicio: string }) {
  const lucroH = R.ms.reduce((s, x) => s + x.ll, 0);
  const multi = R.N > 1;
  const data = R.ms.map((x) => ({ mes: shortMonth(addMonths(inicio, x.m - 1)), acum: Math.round(x.acum), rec: Math.round(x.rec), custo: Math.round(x.custo), ll: Math.round(x.ll) }));
  const dre: [string, number, boolean?][] = [
    ["Ingreso bruto (con IVA)", R.palR * R.precoBruto],
    ["(−) IVA", -(R.palR * R.precoBruto - R.recR)],
    ["Ingreso neto", R.recR, true],
    ["(−) Alquiler", -params.aluguel * R.N],
    ["(−) Salarios", -params.salario * params.pessoas * R.N],
    ["(−) Monitoreo", -(params.monit / params.cambio) * R.N],
    ["(−) Otros costos fijos", -R.outros],
    ["(−) Costos variables", -R.palR * params.varPos],
    ["EBITDA (caja operativa)", R.ebitdaR, true],
    [`(−) Depreciación estructura (${params.depEst} años)`, -R.depEst],
    [`(−) Depreciación apiladora (${params.depApil} años)`, -R.depApil],
    [`(−) Depreciación seguridad y otros (${params.depEq} años)`, -R.depOut],
    ["(−) IRE", -R.ireR],
    ["Resultado neto", R.llR, true],
  ];
  const years = Array.from({ length: Math.ceil(R.H / 12) }, (_, a) => {
    const sl = R.ms.slice(a * 12, a * 12 + 12);
    const s = (k: keyof typeof sl[number]) => sl.reduce((t, x) => t + (x[k] as number), 0);
    return { a: a + 1, n: sl.length, nB: sl[sl.length - 1].nB, pal: s("pal") / sl.length, occ: s("occ") / sl.length, rec: s("rec"), custo: s("custo"), ebitda: s("ebitda"), ll: s("ll"), inv: s("inv") + (a === 0 ? R.i0 : 0), acum: sl[sl.length - 1].acum };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Inversión en caja" value={usd0(R.iTot)} detail={multi ? `${R.N} depósitos · ${usd0(R.i0)} el 1.º` : `${usd0(R.invCaixa)} activos + ${usd0(R.giro)} capital de giro`} />
        <Kpi label="Payback" value={R.payback ? `${R.payback} meses` : `> ${R.H} meses`} detail={R.payback ? `en ${periodLabel(addMonths(inicio, R.payback - 1))}` : "no recupera en el horizonte"} tone={R.payback === null ? "bad" : R.payback <= 24 ? "good" : "warn"} />
        <Kpi label="TIR" value={R.tir !== null ? `${pct(R.tir)} a.a.` : "—"} detail={`flujo de ${R.H} meses`} tone={R.tir === null ? "bad" : R.tir >= params.tma / 100 ? "good" : "warn"} />
        <Kpi label={`VPN (${params.tma}% a.a.)`} value={usd0(R.vpl)} detail="positivo = crea valor sobre la tasa" tone={R.vpl >= 0 ? "good" : "bad"} />
        <Kpi label="Resultado neto mensual en régimen" value={usd0(R.llR)} detail={`${R.palR} pallets (${pct(params.occAlvo / 100, 0)} de ${R.cap})`} tone={R.llR >= 0 ? "good" : "bad"} />
        <Kpi label="Punto de equilibrio" value={isFinite(R.be) ? `${R.be} pallets` : "—"} detail={`${pct(R.be / R.cap)} de ocupación · ${isFinite(R.beDep) ? R.beDep : "—"} con depreciación`} />
        <Kpi label="ROI anual en régimen" value={pct(R.roiAno)} detail={`${usd0(R.llR * 12)}/año ÷ ${usd0(R.iTot)}`} tone={R.roiAno > 0 ? "good" : "bad"} />
        <Kpi label={`Resultado acumulado (${R.H} m)`} value={usd0(lucroH)} detail={`costo fijo ${usd0(R.fixo)}/mes`} tone={lucroH >= 0 ? "good" : "bad"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Caja acumulada">
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ left: 4, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval={11} />
                <YAxis tickFormatter={kfmt} tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => usd0(v)} />
                <ReferenceLine y={0} stroke={C.plan} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="acum" name="Caja acumulada" stroke={C.real} fill={C.real} fillOpacity={0.12} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Ingresos y costos por mes">
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ left: 4, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval={11} />
                <YAxis tickFormatter={kfmt} tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => usd0(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="rec" name="Ingreso neto" stroke={C.real} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="custo" name="Costos" stroke={C.bad} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="ll" name="Resultado neto" stroke={C.good} dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Mes típico en régimen">
        <Table>
          <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">US$/mes</TableHead><TableHead className="text-right">% ingreso neto</TableHead></TableRow></TableHeader>
          <TableBody>
            {dre.map(([l, v, b]) => (
              <TableRow key={l} className={b ? "font-semibold" : ""}>
                <TableCell>{l}</TableCell>
                <TableCell className={cn("text-right tabular-nums", b && v < 0 && "text-destructive")}>{formatMoney(v)}</TableCell>
                <TableCell className="text-right tabular-nums">{R.recR ? pct(v / R.recR) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Resumen por año">
        <div className="overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader><TableRow>
              <TableHead>Año</TableHead><TableHead className="text-right">Depósitos</TableHead><TableHead className="text-right">Pallets prom.</TableHead><TableHead className="text-right">Ocupación</TableHead>
              <TableHead className="text-right">Ingreso neto</TableHead><TableHead className="text-right">Costos</TableHead><TableHead className="text-right">EBITDA</TableHead><TableHead className="text-right">Resultado</TableHead>
              <TableHead className="text-right">Inversión</TableHead><TableHead className="text-right">Caja al cierre</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.a}>
                  <TableCell>Año {y.a}{y.n < 12 ? ` (${y.n} m)` : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{y.nB}</TableCell>
                  <TableCell className="text-right tabular-nums">{Math.round(y.pal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(y.occ)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd0(y.rec)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd0(-y.custo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd0(y.ebitda)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", y.ll < 0 ? "text-destructive" : "text-success")}>{usd0(y.ll)}</TableCell>
                  <TableCell className="text-right tabular-nums">{y.inv ? usd0(-y.inv) : "—"}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", y.acum < 0 ? "text-destructive" : "text-success")}>{usd0(y.acum)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {R.N} depósito(s) de {R.cap1} posiciones{multi ? `, uno nuevo cada ${params.interv} meses` : ""}. Estructura {usd0(R.invEst)} ({params.estCaixa ? "pagada en efectivo" : "recibida como pago de deuda: no sale de caja, pero se deprecia"}).
          La ocupación sube en línea recta de {params.occIni}% a {params.occAlvo}% en {params.rampa} meses. El capital de giro se devuelve al final para VPN y TIR.
        </p>
      </Panel>
    </div>
  );
}

// ---------- vista: real vs. plan ----------

function ActualView({ params, R, inicio, scenarioName }: { params: ProjectionParams; R: ProjectionResult; inicio: string; scenarioName: string }) {
  const hoy = monthLocal();
  const hasta = hoy < inicio ? inicio : hoy;
  const { data: actuals = [], isLoading, error } = useQuery({
    queryKey: ["projection", "actuals", inicio, hasta],
    queryFn: () => fetchActuals(inicio, hasta),
    staleTime: 60_000,
  });

  const rows = useMemo(() => compare(params, R, inicio, actuals), [params, R, inicio, actuals]);
  const rf = useMemo(() => reforecast(params, R, rows), [params, R, rows]);
  const planPayback = planPaybackNoGiro(params, R);

  if (isLoading) return <div className="py-16 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Cargando datos reales…</div>;
  if (error) return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">No se pudieron cargar los datos reales: {(error as Error).message}</div>;
  if (!rows.length) return <div className="rounded-lg border p-8 text-center text-muted-foreground">El escenario empieza en {periodLabel(inicio)}. Todavía no hay meses para comparar.</div>;

  const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const recReal = sum((r) => r.recReal), recPlan = sum((r) => r.plan?.rec ?? 0);
  const ebReal = sum((r) => r.ebitdaReal), ebPlan = sum((r) => r.plan?.ebitda ?? 0);
  const last = rows[rows.length - 1];
  const lastFull = rows.length > 1 && last.periodo === hoy ? rows[rows.length - 2] : last; // último mes cerrado
  const recent = rows.filter((r) => r.palReal > 0).slice(-3);
  const precioReal = recent.length ? recent.reduce((s, r) => s + (r.precioReal || 0), 0) / recent.length : null;
  const costoReal = recent.length ? recent.reduce((s, r) => s + r.costoReal, 0) / recent.length : null;
  const beReal = precioReal && costoReal ? Math.ceil(costoReal / Math.max(0.01, precioReal - params.varPos)) : null;
  const capRef = lastFull.plan?.cap || R.cap1;

  const chart = R.ms.map((p) => {
    const per = addMonths(inicio, p.m - 1);
    const r = rows.find((x) => x.m === p.m);
    const f = rf?.rows.find((x) => x.m === p.m);
    return {
      mes: shortMonth(per), m: p.m,
      occPlan: Math.round(p.occ * 1000) / 10, occReal: r ? Math.round(r.occReal * 1000) / 10 : null, occProy: f ? Math.round(f.occ * 1000) / 10 : null,
      recPlan: Math.round(p.rec), recReal: r ? Math.round(r.recReal) : null,
      costoPlan: Math.round(p.custo), costoReal: r ? Math.round(r.costoReal) : null,
      cajaPlan: Math.round(planCashNoGiro(params, R, p)), cajaReal: r ? Math.round(r.cajaAcum) : null, cajaProy: f ? Math.round(f.acum) : (r && r.m === rf?.desde ? Math.round(r.cajaAcum) : null),
    };
  });
  const shortChart = chart.slice(0, Math.max(rows.length + 6, 12));

  const tone = (v: number | null, higherIsGood = true) => (v === null ? undefined : (higherIsGood ? v >= -0.05 : v <= 0.05) ? "good" : v >= -0.2 && v <= 0.2 ? "warn" : "bad");
  const vRec = variance(recReal, recPlan), vEb = ebPlan ? (ebReal - ebPlan) / Math.abs(ebPlan) : null;
  const vOcc = lastFull.plan ? lastFull.occReal - lastFull.plan.occ : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escenario <b className="text-foreground">{scenarioName}</b> desde {periodLabel(inicio)} · {rows.length} mes(es) con datos. Ingresos sin IVA según las facturas emitidas de cada mes; costos según los gastos registrados (las inversiones van aparte).
      </p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label={`Ocupación ${periodLabel(lastFull.periodo)}`} value={pct(lastFull.occReal)} detail={<>plan {pct(lastFull.plan?.occ)} · {Math.round(lastFull.palReal)} de {capRef} posiciones</>} tone={vOcc === null ? undefined : vOcc >= -0.02 ? "good" : vOcc >= -0.1 ? "warn" : "bad"} />
        <Kpi label="Ingreso neto acumulado" value={usd0(recReal)} detail={<>plan {usd0(recPlan)} · {vRec === null ? "—" : `${vRec >= 0 ? "+" : ""}${pct(vRec)}`}</>} tone={tone(vRec)} />
        <Kpi label="EBITDA acumulado" value={usd0(ebReal)} detail={<>plan {usd0(ebPlan)} · diferencia {usd0(ebReal - ebPlan)}</>} tone={ebReal >= ebPlan ? "good" : tone(vEb)} />
        <Kpi label="Caja acumulada" value={usd0(last.cajaAcum)} detail={<>plan {last.planCaja !== null ? usd0(last.planCaja) : "—"} · cobrado − gastos − inversiones</>} tone={last.planCaja === null ? undefined : last.cajaAcum >= last.planCaja ? "good" : "warn"} />
        <Kpi label="Precio neto por pallet" value={precioReal !== null ? formatMoney(precioReal) : "—"} detail={<>plan {formatMoney(R.precoLiq)} · prom. últimos 3 meses</>} tone={precioReal === null ? undefined : precioReal >= R.precoLiq * 0.97 ? "good" : "warn"} />
        <Kpi label="Costo fijo mensual" value={costoReal !== null ? usd0(costoReal) : "—"} detail={<>plan {usd0(R.fixo1 + R.outros)} · prom. últimos 3 meses</>} tone={costoReal === null ? undefined : costoReal <= (R.fixo1 + R.outros) * 1.05 ? "good" : "warn"} />
        <Kpi label="Punto de equilibrio real" value={beReal ? `${beReal} pallets` : "—"} detail={beReal ? `${pct(beReal / capRef)} de ocupación con precio y costos reales` : "sin datos suficientes"} tone={beReal && lastFull.palReal >= beReal ? "good" : "warn"} />
        <Kpi label="Payback reproyectado" value={rf?.payback ? `mes ${rf.payback}` : `> ${R.H} meses`} detail={<>plan: {planPayback ? `mes ${planPayback}` : "—"}{rf?.payback ? ` · ${periodLabel(addMonths(inicio, rf.payback - 1))}` : ""}</>} tone={!rf?.payback ? "bad" : planPayback && rf.payback <= planPayback ? "good" : "warn"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ocupación: real vs. plan">
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={shortChart} margin={{ left: 0, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} width={44} domain={[0, 100]} />
                <Tooltip formatter={(v: number) => `${formatNumber(v, 1)}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="occReal" name="Real" fill={C.real} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="occPlan" name="Plan" stroke={C.plan} strokeDasharray="5 4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="occProy" name="Proyección actualizada" stroke={C.warn} dot={false} strokeWidth={2} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Ingreso neto y costos por mes">
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={shortChart.slice(0, rows.length)} margin={{ left: 4, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={kfmt} tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => usd0(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="recReal" name="Ingreso real" fill={C.real} radius={[3, 3, 0, 0]} />
                <Bar dataKey="costoReal" name="Costos reales" fill={C.bad} fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="recPlan" name="Ingreso plan" stroke={C.real} strokeDasharray="5 4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="costoPlan" name="Costos plan" stroke={C.bad} strokeDasharray="5 4" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Caja acumulada: real, plan y proyección actualizada">
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ left: 4, right: 8, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} interval={5} />
              <YAxis tickFormatter={kfmt} tick={{ fontSize: 11 }} width={52} />
              <Tooltip formatter={(v: number) => usd0(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke={C.plan} />
              <Line type="monotone" dataKey="cajaPlan" name="Plan" stroke={C.plan} strokeDasharray="5 4" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="cajaProy" name="Proyección actualizada" stroke={C.warn} dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="cajaReal" name="Real" stroke={C.real} dot={{ r: 3 }} strokeWidth={2.5} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {rf && (
          <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Proyección actualizada: parte de la caja real y de la ocupación real ({pct(rf.occInicial)}) y crece al mismo ritmo que el escenario ({formatNumber((params.occAlvo - params.occIni) / Math.max(1, params.rampa - 1), 1)} puntos por mes) hasta {params.occAlvo}%,
            con precio neto {formatMoney(rf.precioUsado)}/pallet y costo fijo {usd0(rf.costoUsado)}/mes (promedios reales de los últimos 3 meses).
          </p>
        )}
      </Panel>

      <Panel title="Mes a mes">
        <div className="overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader><TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Pallets real</TableHead><TableHead className="text-right">plan</TableHead>
              <TableHead className="text-right">Ocupación</TableHead>
              <TableHead className="text-right">Ingreso neto real</TableHead><TableHead className="text-right">plan</TableHead><TableHead className="text-right">desv.</TableHead>
              <TableHead className="text-right">Costos real</TableHead><TableHead className="text-right">plan</TableHead>
              <TableHead className="text-right">EBITDA real</TableHead><TableHead className="text-right">plan</TableHead>
              <TableHead className="text-right">Cobrado</TableHead><TableHead className="text-right">Inversiones</TableHead>
              <TableHead className="text-right">Caja acum.</TableHead><TableHead className="text-right">plan</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const v = r.plan ? variance(r.recReal, r.plan.rec) : null;
                return (
                  <TableRow key={r.periodo}>
                    <TableCell className="whitespace-nowrap">{periodLabel(r.periodo, true)}{r.periodo === hoy ? " (en curso)" : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.palReal, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.plan?.pal ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.occReal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd0(r.recReal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.plan ? usd0(r.plan.rec) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", v !== null && (v >= 0 ? "text-success" : v < -0.2 ? "text-destructive" : "text-warning"))}>{v === null ? "—" : `${v >= 0 ? "+" : ""}${pct(v, 0)}`}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd0(r.costoReal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.plan ? usd0(r.plan.custo) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.ebitdaReal < 0 && "text-destructive")}>{usd0(r.ebitdaReal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.plan ? usd0(r.plan.ebitda) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd0(r.cobrado)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.inversiones ? usd0(-r.inversiones) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", r.cajaAcum < 0 && "text-destructive")}>{usd0(r.cajaAcum)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.planCaja !== null ? usd0(r.planCaja) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Ocupación real = posiciones ocupadas en promedio por día (pallet doble = 2) ÷ posiciones del escenario.</li>
          <li>Ingreso neto = facturas y notas de crédito emitidas del mes ÷ (1 + IVA). Un mes sin facturar todavía aparece con ingreso cero.</li>
          <li>Inversiones (apiladora, estructura pagada, seguridad, obras) se cargan en Gastos con la categoría «Inversión (activo fijo)»: no entran en costos ni EBITDA, sí en la caja.</li>
          <li>La caja del plan se muestra sin el capital de giro (que queda en caja), para compararla con la real.</li>
        </ul>
      </Panel>
    </div>
  );
}

// ---------- página ----------

const VIEWS = [{ key: "sim", label: "Simulador" }, { key: "real", label: "Real vs. plan" }] as const;

export default function Projection() {
  const qc = useQueryClient();
  const { data: scenarios = [], isLoading } = useQuery({ queryKey: ["projection", "scenarios"], queryFn: fetchScenarios });
  const [view, setView] = useState<"sim" | "real">("sim");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useState<ProjectionParams>(DEFAULT_PARAMS);
  const [nombre, setNombre] = useState("Nuevo escenario");
  const [inicio, setInicio] = useState(monthLocal());
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isMobile = useIsMobile();

  const selected = scenarios.find((s) => s.id === selectedId) || null;
  const load = (s: Scenario | null) => {
    setSelectedId(s?.id ?? null);
    setParams(s ? s.params : DEFAULT_PARAMS);
    setNombre(s ? s.nombre : "Nuevo escenario");
    setInicio(s ? s.inicio : monthLocal());
    setNotas(s?.notas ?? "");
  };
  // Al abrir: carga el escenario base (o el más reciente)
  useEffect(() => { if (!isLoading && selectedId === null && scenarios.length) load(scenarios.find((s) => s.esBase) || scenarios[0]); }, [isLoading, scenarios]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !selected || JSON.stringify(selected.params) !== JSON.stringify(params) || selected.nombre !== nombre || selected.inicio !== inicio || selected.notas !== notas;
  const R = useMemo(() => runProjection(params), [params]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["projection", "scenarios"] });

  const save = async (asNew: boolean) => {
    if (!/^\d{4}-\d{2}$/.test(inicio)) { toast.error("Indique el mes de inicio."); return; }
    setBusy(true);
    try {
      const s = await saveScenario({ id: asNew ? undefined : selected?.id, nombre: asNew && selected && nombre === selected.nombre ? `${nombre} (copia)` : nombre, inicio, params, notas });
      await refresh();
      load(s);
      toast.success(asNew ? "Escenario creado" : "Escenario guardado");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const makeBase = async () => {
    if (!selected) return;
    setBusy(true);
    try { await setBaseScenario(selected.id); await refresh(); toast.success(`«${selected.nombre}» es ahora el plan base`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    try { await deleteScenario(selected.id); await refresh(); load(null); toast.success("Escenario eliminado"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setConfirmDelete(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proyección</h1>
          <p className="text-sm text-muted-foreground">Simule escenarios y compare el plan con los ingresos, costos, ocupación y caja reales.</p>
        </div>
        <div role="tablist" className="flex rounded-md border p-0.5">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
              className={cn("rounded px-3 py-1.5 text-sm font-medium", view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Escenario */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="sc-sel">Escenario</label>
          <Select value={selectedId ?? "_new"} onValueChange={(v) => load(v === "_new" ? null : scenarios.find((s) => s.id === v) || null)}>
            <SelectTrigger id="sc-sel" className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {scenarios.map((s) => <SelectItem key={s.id} value={s.id}>{s.esBase ? "★ " : ""}{s.nombre}</SelectItem>)}
              <SelectItem value="_new">+ Nuevo escenario</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="sc-nombre">Nombre</label>
          <Input id="sc-nombre" className="w-56" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="sc-inicio">Mes 1</label>
          <Input id="sc-inicio" type="month" className="w-40" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="grid min-w-48 flex-1 gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="sc-notas">Notas</label>
          <Input id="sc-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Supuestos del escenario" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => save(false)} disabled={busy || (!!selected && !dirty)}><Save className="mr-1 h-4 w-4" />{selected ? "Guardar" : "Guardar escenario"}</Button>
          {selected && <Button size="sm" variant="outline" onClick={() => save(true)} disabled={busy}><Copy className="mr-1 h-4 w-4" />Guardar como nuevo</Button>}
          {selected && !selected.esBase && <Button size="sm" variant="outline" onClick={makeBase} disabled={busy}><Star className="mr-1 h-4 w-4" />Marcar como plan base</Button>}
          <Button size="sm" variant="ghost" onClick={() => setParams(selected ? selected.params : DEFAULT_PARAMS)} disabled={busy}><RotateCcw className="mr-1 h-4 w-4" />Deshacer cambios</Button>
          {selected && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {selected?.esBase && <p className="w-full text-xs text-muted-foreground">★ Plan base: es el escenario que se abre por defecto y contra el que se compara lo real.</p>}
        {dirty && selected && <p className="w-full text-xs text-warning">Hay cambios sin guardar. La comparación usa los valores que ve en pantalla.</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="self-start rounded-lg border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {isMobile ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Parámetros del escenario</summary>
              <div className="mt-4"><ParamsForm params={params} onChange={setParams} /></div>
            </details>
          ) : <ParamsForm params={params} onChange={setParams} />}
        </aside>
        <main className="min-w-0">
          {view === "sim"
            ? <SimulatorView params={params} R={R} inicio={inicio} />
            : <ActualView params={params} R={R} inicio={inicio} scenarioName={nombre} />}
        </main>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el escenario «{selected?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>Los datos reales no se modifican; solo se borra este escenario.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

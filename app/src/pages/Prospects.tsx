import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Target, Flame, UserPlus, FileText, DollarSign, Search, Mail, MessageCircle, FileDown, Loader2, Send } from "lucide-react";
import KpiCard from "@/components/shared/KpiCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACTIVITY_LABEL, KIND_LABEL, STATUS_LABEL, addActivity, fetchProspectHistory, fetchProspects, temperature, updateProspect,
  type Prospect, type ProspectActivity, type ProspectStatus,
} from "@/data/marketing";
import { formatDateTime, todayLocal } from "@/lib/dates";
import { formatCurrency } from "@/lib/formatters";
import { parseDbError } from "@/lib/errorMessages";

const STATUSES = Object.keys(STATUS_LABEL) as ProspectStatus[];
const OPEN: ProspectStatus[] = ["novo", "contatado", "negociacao"];
const waLink = (phone: string, text: string) => `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(text)}`;

function ScoreBadge({ score }: { score: number }) {
  const t = temperature(score);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.className}`}>
      {score} · {t.label}
    </span>
  );
}

export default function Prospects() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: prospects = [], isLoading, error } = useQuery({ queryKey: ["prospects"], queryFn: fetchProspects, refetchInterval: 60_000 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"open" | "all" | ProspectStatus>("open");
  const [temp, setTemp] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [selected, setSelected] = useState<Prospect | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return prospects
      .filter((p) => (status === "all" ? true : status === "open" ? OPEN.includes(p.status) : p.status === status))
      .filter((p) => (temp === "all" ? true : temp === "hot" ? p.score >= 60 : temp === "warm" ? p.score >= 30 && p.score < 60 : p.score < 30))
      .filter((p) => !s || [p.name, p.company, p.email, p.phone].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => b.score - a.score || b.last_seen_at.localeCompare(a.last_seen_at));
  }, [prospects, search, status, temp]);

  const weekAgo = Date.now() - 7 * 864e5;
  const kpis = {
    open: prospects.filter((p) => OPEN.includes(p.status)).length,
    hot: prospects.filter((p) => OPEN.includes(p.status) && p.score >= 60).length,
    newWeek: prospects.filter((p) => new Date(p.first_seen_at).getTime() >= weekAgo).length,
    proposals: prospects.filter((p) => p.last_proposal_number).length,
    potential: prospects.filter((p) => OPEN.includes(p.status)).reduce((s, p) => s + (p.last_total_monthly || 0), 0),
  };

  async function changeStatus(p: Prospect, s: ProspectStatus) {
    try {
      await updateProspect(p.id, { status: s });
      if (user) await addActivity(p.id, user.id, "status", `${STATUS_LABEL[p.status]} → ${STATUS_LABEL[s]}`);
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["prospect-history", p.id] });
      if (selected?.id === p.id) setSelected({ ...p, status: s });
    } catch (e) {
      toast.error(parseDbError(e));
    }
  }

  function exportExcel() {
    const rows = filtered.map((p) => ({
      Puntaje: p.score, Temperatura: temperature(p.score).label, Estado: STATUS_LABEL[p.status],
      Nombre: p.name, Empresa: p.company, RUC: p.tax_id, Correo: p.email, WhatsApp: p.phone,
      "Acepta marketing": p.consent_marketing ? "Sí" : "No", Intereses: p.interests.join(", "),
      "Máx. posiciones": p.max_positions, "Último valor mensual (USD)": p.last_total_monthly ?? "",
      "Última propuesta": p.last_proposal_number ?? "", Interacciones: p.lead_count,
      Origen: p.first_source, "Primera visita": formatDateTime(p.first_seen_at), "Última actividad": formatDateTime(p.last_seen_at), Notas: p.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prospectos");
    XLSX.writeFile(wb, `prospectos_${todayLocal()}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Prospectos</h1>
          <p className="text-sm text-muted-foreground">Contactos del sitio con puntaje de interés. Los más calientes primero.</p>
        </div>
        <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}><FileDown className="h-4 w-4 mr-2" />Exportar Excel</Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <KpiCard title="Abiertos" value={kpis.open} icon={Target} />
        <KpiCard title="Calientes" value={kpis.hot} subtitle="puntaje ≥ 60" icon={Flame} color="destructive" />
        <KpiCard title="Nuevos (7 días)" value={kpis.newWeek} icon={UserPlus} color="success" />
        <KpiCard title="Con propuesta" value={kpis.proposals} icon={FileText} />
        <KpiCard title="Potencial mensual" value={formatCurrency(kpis.potential)} subtitle="abiertos, última simulación" icon={DollarSign} color="warning" />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar nombre, empresa, correo o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abiertos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={temp} onValueChange={(v) => setTemp(v as typeof temp)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda temperatura</SelectItem>
            <SelectItem value="hot">Calientes</SelectItem>
            <SelectItem value="warm">Tibios</SelectItem>
            <SelectItem value="cold">Fríos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Puntaje</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="hidden md:table-cell">Interés</TableHead>
              <TableHead className="hidden lg:table-cell">Última actividad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            )}
            {error && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-destructive">{parseDbError(error)}</TableCell></TableRow>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin prospectos con estos filtros.</TableCell></TableRow>
            )}
            {filtered.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelected(p)}>
                <TableCell><ScoreBadge score={p.score} /></TableCell>
                <TableCell>
                  <div className="font-medium">{p.name} {p.consent_marketing && <Badge variant="secondary" className="ml-1 text-[10px]">acepta marketing</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{p.company || "—"} · {p.email}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  {p.max_positions > 0 ? `${p.max_positions} posiciones` : "—"}
                  {p.last_total_monthly ? <div className="text-xs text-muted-foreground">{formatCurrency(p.last_total_monthly)}/mes</div> : null}
                  {p.interests.includes("estruturas") && <Badge variant="outline" className="mt-1 text-[10px]">Estructuras</Badge>}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm">
                  {formatDateTime(p.last_seen_at)}
                  <div className="text-xs text-muted-foreground">{p.last_kind ? KIND_LABEL[p.last_kind as keyof typeof KIND_LABEL] : ""} · {p.lead_count} interacc.</div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select value={p.status} onValueChange={(v) => changeStatus(p, v as ProspectStatus)}>
                    <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  {p.phone && (
                    <Button asChild size="icon" variant="ghost" title="WhatsApp">
                      <a href={waLink(p.phone, `Hola ${p.name.split(" ")[0]}, le escribimos de StockFlex sobre su consulta de almacenaje.`)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /></a>
                    </Button>
                  )}
                  <Button asChild size="icon" variant="ghost" title="Correo">
                    <a href={`mailto:${p.email}?subject=${encodeURIComponent("StockFlex — su consulta de almacenaje")}`}><Mail className="h-4 w-4" /></a>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ProspectSheet prospect={selected} onClose={() => setSelected(null)} onStatus={changeStatus} />
    </div>
  );
}

function ProspectSheet({ prospect, onClose, onStatus }: { prospect: Prospect | null; onClose: () => void; onStatus: (p: Prospect, s: ProspectStatus) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["prospect-history", prospect?.id],
    queryFn: () => fetchProspectHistory(prospect!.id),
    enabled: !!prospect,
  });
  const [noteKind, setNoteKind] = useState<ProspectActivity["kind"]>("nota");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const latestEng = data?.leads.find((l) => l.engagement)?.engagement as Record<string, unknown> | undefined;

  async function saveNote() {
    if (!prospect || !user || !note.trim()) return;
    setSaving(true);
    try {
      await addActivity(prospect.id, user.id, noteKind, note.trim());
      setNote("");
      qc.invalidateQueries({ queryKey: ["prospect-history", prospect.id] });
    } catch (e) {
      toast.error(parseDbError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!prospect} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {prospect && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 flex-wrap">{prospect.name} <ScoreBadge score={prospect.score} /></SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">Empresa</div>{prospect.company || "—"}{prospect.tax_id ? ` · ${prospect.tax_id}` : ""}</div>
                <div><div className="text-xs text-muted-foreground">Correo</div><a className="underline" href={`mailto:${prospect.email}`}>{prospect.email}</a></div>
                <div><div className="text-xs text-muted-foreground">WhatsApp</div>{prospect.phone || "—"}</div>
                <div><div className="text-xs text-muted-foreground">Marketing</div>{prospect.consent_marketing ? "Acepta comunicaciones" : "No aceptó"}</div>
                <div><div className="text-xs text-muted-foreground">Origen</div>{prospect.first_source || "—"}</div>
                <div><div className="text-xs text-muted-foreground">Primera visita</div>{formatDateTime(prospect.first_seen_at)}</div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Estado</span>
                <Select value={prospect.status} onValueChange={(v) => onStatus(prospect, v as ProspectStatus)}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {latestEng && (
                <div className="rounded-lg border p-3">
                  <div className="font-semibold mb-2">Comportamiento en el sitio</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-lg font-bold">{String(latestEng.visits ?? "—")}</div><div className="text-xs text-muted-foreground">visitas</div></div>
                    <div><div className="text-lg font-bold">{Math.round(Number(latestEng.activeSeconds || 0) / 60)} min</div><div className="text-xs text-muted-foreground">tiempo activo</div></div>
                    <div><div className="text-lg font-bold">{String(latestEng.simulatorEdits ?? 0)}</div><div className="text-xs text-muted-foreground">ajustes en simulador</div></div>
                  </div>
                  {Array.isArray(latestEng.sections) && (
                    <div className="mt-2 flex flex-wrap gap-1">{(latestEng.sections as string[]).map((s) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}</div>
                  )}
                </div>
              )}

              <div>
                <div className="font-semibold mb-2">Simulaciones y solicitudes</div>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <div className="space-y-2">
                  {data?.leads.map((l) => {
                    const d = (l.details || {}) as { totalPositions?: number; months?: number; totalMonthly?: number };
                    return (
                      <div key={l.id} className="rounded border p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{KIND_LABEL[l.kind]}{l.proposal_number ? ` · ${l.proposal_number}` : ""}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(l.updated_at || l.created_at)}</span>
                        </div>
                        {d.totalPositions ? (
                          <div className="text-xs text-muted-foreground">{d.totalPositions} posiciones · {d.months} meses · {formatCurrency(Number(d.totalMonthly || 0))}/mes</div>
                        ) : l.message ? <div className="text-xs text-muted-foreground line-clamp-3">{l.message}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="font-semibold mb-2">Seguimiento</div>
                <div className="flex gap-2 mb-2">
                  <Select value={noteKind} onValueChange={(v) => setNoteKind(v as ProspectActivity["kind"])}>
                    <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["nota", "ligacao", "whatsapp", "email", "visita"] as const).map((k) => <SelectItem key={k} value={k}>{ACTIVITY_LABEL[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-9" onClick={saveNote} disabled={!note.trim() || saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Registrar
                  </Button>
                </div>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué se habló, próximo paso…" className="min-h-[70px]" />
                <div className="mt-3 space-y-2">
                  {data?.activities.map((a) => (
                    <div key={a.id} className="text-xs border-l-2 border-primary/30 pl-2">
                      <span className="font-medium">{ACTIVITY_LABEL[a.kind]}</span> · <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
                      <div className="text-sm whitespace-pre-line">{a.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

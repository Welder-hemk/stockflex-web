// Gestión de adendas de un contrato: ampliar posiciones durante la vigencia.
// El precio de la adenda vale solo para las posiciones adicionales; la comisión del agente no cambia.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FilePlus2, Loader2, Printer, Send, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listPrice } from "@/components/forms/ContractForm";
import { useStockData } from "@/contexts/StockDataContext";
import { amendmentCounts, cancelAmendment, createAmendment, issueAmendment, markAmendmentSigned, type Amendment } from "@/data/amendments";
import { fetchContractFiles, fetchSettings } from "@/data/contractDocs";
import { contractTotalPositions, type Client, type Contract } from "@/data/types";
import { DEFAULT_AMENDMENT_TEMPLATE } from "@/lib/contract/defaultTemplate";
import { amendmentValues, contractHtml, fillTemplate } from "@/lib/contract/render";
import { printContract } from "@/lib/print/contractDoc";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { formatMoney, parseDecimal, toInputDecimal } from "@/lib/formatters";
import { ContractFileList, ContractUpload } from "./ContractFiles";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const AMENDMENT_STATE: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
  para_firma: { label: "Para firma", cls: "bg-warning/15 text-warning border-warning/40" },
  aceptado: { label: "Aceptada", cls: "bg-primary/10 text-primary border-primary/40" },
  firmado: { label: "Firmada", cls: "bg-success/15 text-success border-success/40" },
  anulada: { label: "Anulada", cls: "bg-destructive/10 text-destructive border-destructive/30 line-through" },
};

/** Texto de la adenda con los datos actuales (las adendas anteriores vigentes suman a "posiciones anteriores") */
export function amendmentText(a: Pick<Amendment, "id" | "numero" | "fechaInicio" | "posiciones" | "precio">, c: Contract, cl: Client | undefined, settings: Record<string, string>, all: Amendment[]) {
  const prev = all.filter((x) => x.contratoId === c.id && x.id !== a.id && amendmentCounts(x) && x.fechaInicio <= a.fechaInicio).reduce((s, x) => s + x.posiciones, 0);
  return fillTemplate(DEFAULT_AMENDMENT_TEMPLATE, amendmentValues(a, c, cl, settings, prev));
}

export default function AmendmentDialog({ contract, client, open, onOpenChange }: { contract: Contract | null; client?: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { amendments, refresh } = useStockData();
  const setQ = useQuery({ queryKey: ["app-settings"], queryFn: fetchSettings, enabled: open });
  const filesQ = useQuery({ queryKey: ["contract-files", contract?.id], queryFn: () => fetchContractFiles([contract!.id]), enabled: open && !!contract });
  const settings = useMemo(() => setQ.data || {}, [setQ.data]);
  const list = useMemo(() => amendments.filter((a) => a.contratoId === contract?.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [amendments, contract]);

  const [fecha, setFecha] = useState(todayLocal());
  const [posiciones, setPosiciones] = useState("");
  const [precio, setPrecio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showId, setShowId] = useState<string | null>(null);

  if (!contract) return null;
  const total = contractTotalPositions(contract);
  const qty = parseInt(posiciones, 10) || 0;
  // Precio sugerido: tabla vigente para el total de posiciones que resulta (sin recargo de plazo:
  // la adenda acompaña el plazo del contrato original)
  const sug = qty > 0 ? listPrice(total + qty) : 0;
  const precioNum = parseDecimal(precio);

  const reload = async () => { await refresh(); qc.invalidateQueries({ queryKey: ["contract-files", contract.id] }); };
  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try { await fn(); toast.success(ok); await reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  const create = () => run("create", async () => {
    if (qty <= 0) throw new Error("Indique cuántas posiciones adicionales");
    if (!(precioNum > 0)) throw new Error("Indique el precio por posición");
    const r = await createAmendment(contract.id, fecha, qty, precioNum, motivo);
    setShowId(r.id); setPosiciones(""); setPrecio(""); setMotivo("");
  }, "Adenda creada como borrador: revise el texto y emítala para firma");

  const issue = (a: Amendment) => run(`issue-${a.id}`, async () => {
    const { text, missing } = amendmentText(a, contract, client, settings, amendments);
    if (missing.length) throw new Error(`Faltan datos: ${missing.join(", ")}`);
    await issueAmendment(a.id, text);
  }, "Adenda emitida: el cliente puede verla y aceptarla en el portal");

  const print = (a: Amendment) => {
    const texto = a.docTexto || amendmentText(a, contract, client, settings, amendments).text;
    printContract({
      tipo: "Adenda", texto, numero: a.numero, version: 1, borrador: a.docEstado === "borrador",
      empresa: settings.empresa_razon_social || "StockFlex", cliente: client?.razaoSocial || "",
      aceptado: a.aceptadoAt ? { nombre: a.aceptadoNombre || "", documento: a.aceptadoDocumento || "", fecha: a.aceptadoAt } : null,
    });
  };

  const cancel = (a: Amendment) => {
    const m = window.prompt(`Motivo para anular la adenda ${a.numero}:`);
    if (!m) return;
    run(`cancel-${a.id}`, () => cancelAmendment(a.id, m), "Adenda anulada");
  };

  const shown = list.find((a) => a.id === showId);
  const shownText = shown ? (shown.docTexto || amendmentText(shown, contract, client, settings, amendments).text) : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setShowId(null); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FilePlus2 className="h-5 w-5" />Adendas del contrato {contract.numero}</DialogTitle>
          <DialogDescription>
            {client?.razaoSocial} · hoy {total} posiciones ({contract.posicoesContratadas} del contrato{contract.posicoesAdicionais ? ` + ${contract.posicoesAdicionais} por adenda` : ""}) · vence {formatDate(contract.dataTermino)}.
            La adenda termina junto con el contrato; su precio vale solo para las posiciones adicionales y no genera comisión.
          </DialogDescription>
        </DialogHeader>

        {list.length > 0 && (
          <div className="rounded-lg border divide-y">
            {list.map((a) => {
              const st = AMENDMENT_STATE[a.docEstado];
              return (
                <div key={a.id} className={cn("p-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center", showId === a.id && "bg-muted/40")}>
                  <button className="text-left" onClick={() => setShowId(showId === a.id ? null : a.id)}>
                    <div className="font-semibold flex items-center gap-2">{a.numero} <Badge variant="outline" className={st.cls}>{st.label}</Badge></div>
                    <div className="text-xs text-muted-foreground">
                      +{a.posiciones} posiciones desde {formatDate(a.fechaInicio)} · {formatMoney(a.precio, contract.moeda)}/pos. · {formatMoney(a.posiciones * a.precio, contract.moeda)}/mes
                      {a.motivo ? ` · ${a.motivo}` : ""}
                      {a.aceptadoAt ? ` · aceptada por ${a.aceptadoNombre} el ${formatDateTime(a.aceptadoAt)}` : ""}
                      {a.anuladaMotivo ? ` · anulada: ${a.anuladaMotivo}` : ""}
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {a.docEstado !== "anulada" && <Button size="sm" variant="outline" onClick={() => print(a)}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>}
                    {a.docEstado === "borrador" && <Button size="sm" disabled={!!busy} onClick={() => issue(a)}>{busy === `issue-${a.id}` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}Emitir para firma</Button>}
                    {(a.docEstado === "para_firma" || a.docEstado === "aceptado") && <Button size="sm" disabled={!!busy} onClick={() => run(`sign-${a.id}`, () => markAmendmentSigned(a.id), "Adenda marcada como firmada")}><CheckCircle2 className="h-4 w-4 mr-1" />Validar firma</Button>}
                    {a.docEstado !== "anulada" && a.docEstado !== "firmado" && <Button size="sm" variant="ghost" className="text-destructive" disabled={!!busy} onClick={() => cancel(a)}><XCircle className="h-4 w-4 mr-1" />Anular</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {shown && (
          <div className="rounded-lg border bg-white text-black p-5 max-h-[360px] overflow-y-auto" style={{ font: "12px/1.5 Georgia, serif" }} dangerouslySetInnerHTML={{ __html: contractHtml(shownText) }} />
        )}

        {contract.status === "ativo" ? (
          <div className="rounded-lg border p-4 grid gap-3">
            <div className="text-sm font-semibold">Nueva adenda</div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <div className="grid gap-1.5"><Label htmlFor="am-fecha">Desde</Label><Input id="am-fecha" type="date" value={fecha} min={contract.dataInicio} max={contract.dataTermino} onChange={(e) => setFecha(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label htmlFor="am-pos">Posiciones adicionales</Label><Input id="am-pos" inputMode="numeric" value={posiciones} onChange={(e) => setPosiciones(e.target.value.replace(/\D/g, ""))} placeholder="30" /></div>
              <div className="grid gap-1.5">
                <Label htmlFor="am-precio">Precio por posición/mes</Label>
                <Input id="am-precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder={sug ? toInputDecimal(sug) : ""} />
                {sug > 0 && <button type="button" className="text-left text-xs text-primary hover:underline" onClick={() => setPrecio(toInputDecimal(sug))}>Tabla: {formatMoney(sug, contract.moeda)} (para {total + qty} posiciones en total)</button>}
              </div>
              <div className="grid gap-1.5"><Label htmlFor="am-mot">Motivo</Label><Input id="am-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ampliación de stock" /></div>
            </div>
            {qty > 0 && precioNum > 0 && (
              <p className="text-sm text-muted-foreground">
                Desde {formatDate(fecha)}: {total} → <strong>{total + qty}</strong> posiciones · + {formatMoney(qty * precioNum, contract.moeda)}/mes por las adicionales (el primer mes, proporcional).
              </p>
            )}
            <div className="flex justify-end"><Button onClick={create} disabled={!!busy || qty <= 0 || !(precioNum > 0)}>{busy === "create" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FilePlus2 className="h-4 w-4 mr-1" />}Crear adenda</Button></div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Solo los contratos activos admiten adendas.</p>
        )}

        <div className="grid gap-2">
          <div className="text-sm font-semibold">Copias firmadas</div>
          <ContractUpload contratoId={contract.id} clienteId={contract.clienteId} byClient={false} types={["adenda"]} onDone={reload} />
          <ContractFileList files={(filesQ.data || []).filter((f) => f.tipo === "adenda")} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

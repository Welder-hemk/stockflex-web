// Portal del cliente: ver e imprimir el contrato, aceptarlo electrónicamente y adjuntar la copia firmada o anexos.
// Los archivos se pueden ver y agregar, pero no modificar ni eliminar (solo la gestión).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Client, Contract } from "@/data/types";
import { acceptContract, fetchContractDoc, fetchContractFiles, fetchSettings, type ContractDocInfo } from "@/data/contractDocs";
import { contractHtml } from "@/lib/contract/render";
import { printContract } from "@/lib/print/contractDoc";
import { formatDate, formatDateTime } from "@/lib/dates";
import { useStockData } from "@/contexts/StockDataContext";
import { ContractFileList, ContractUpload, DocStateBadge } from "@/components/contracts/ContractFiles";
import { toast } from "sonner";

export default function ClientContracts({ client, contracts }: { client: Client; contracts: Contract[] }) {
  const ids = contracts.map((c) => c.id);
  const filesQ = useQuery({ queryKey: ["contract-files", "client", client.id, ids.join(",")], queryFn: () => fetchContractFiles(ids), enabled: ids.length > 0 });
  const setQ = useQuery({ queryKey: ["app-settings"], queryFn: fetchSettings });
  const sorted = [...contracts].sort((a, b) => (a.status === "ativo" ? -1 : 1) - (b.status === "ativo" ? -1 : 1) || b.dataInicio.localeCompare(a.dataInicio));

  if (!contracts.length) return <p className="text-sm text-muted-foreground py-6">No hay contratos registrados.</p>;
  return (
    <div className="space-y-4">
      {sorted.map((c, i) => (
        <ContractCard key={c.id} contract={c} client={client} empresa={setQ.data?.empresa_razon_social || "StockFlex"} files={(filesQ.data || []).filter((f) => f.contratoId === c.id)} reloadFiles={() => filesQ.refetch()} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

function ContractCard({ contract, client, empresa, files, reloadFiles, defaultOpen }: {
  contract: Contract; client: Client; empresa: string; files: Awaited<ReturnType<typeof fetchContractFiles>>; reloadFiles: () => void; defaultOpen: boolean;
}) {
  const qc = useQueryClient();
  const { refresh } = useStockData();
  const [open, setOpen] = useState(defaultOpen);
  const [accepting, setAccepting] = useState(false);
  const docQ = useQuery({ queryKey: ["contract-doc", contract.id], queryFn: () => fetchContractDoc(contract.id) });
  const doc = docQ.data;
  const issued = !!doc?.docTexto && doc.docEstado !== "borrador";

  const print = () => doc?.docTexto && printContract({
    texto: doc.docTexto, numero: contract.numero, version: doc.docVersion, empresa, cliente: client.razaoSocial,
    aceptado: doc.aceptadoAt ? { nombre: doc.aceptadoNombre || "", documento: doc.aceptadoDocumento || "", fecha: doc.aceptadoAt } : null,
  });

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold flex items-center gap-2">Contrato {contract.numero} {doc && <DocStateBadge estado={doc.docEstado} />}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(contract.dataInicio)} → {formatDate(contract.dataTermino)} · {contract.posicoesContratadas} posiciones
            {doc?.aceptadoAt && ` · Aceptado por ${doc.aceptadoNombre} el ${formatDateTime(doc.aceptadoAt)}`}
          </div>
        </div>
        {issued && <Button size="sm" variant="outline" onClick={print}><Printer className="h-4 w-4 mr-1" />Imprimir</Button>}
        {doc?.docEstado === "para_firma" && <Button size="sm" onClick={() => setAccepting(true)}><CheckCircle2 className="h-4 w-4 mr-1" />Aceptar contrato</Button>}
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-label={open ? "Ocultar" : "Ver"}>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
      </div>

      {open && (
        <div className="border-t p-4 space-y-4">
          {docQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : issued ? (
            <div className="rounded-lg border bg-white text-black p-5 max-h-[460px] overflow-y-auto" style={{ font: "12px/1.5 Georgia, serif" }} dangerouslySetInnerHTML={{ __html: contractHtml(doc!.docTexto!) }} />
          ) : (
            <p className="text-sm text-muted-foreground">StockFlex todavía no publicó el texto de este contrato.</p>
          )}

          {doc?.docEstado === "para_firma" && (
            <p className="text-sm rounded-md bg-muted/50 p-3">Lea el contrato y acéptelo electrónicamente, o imprímalo, fírmelo y adjunte la copia firmada abajo.</p>
          )}
          {doc?.docEstado === "aceptado" && !files.some((f) => f.tipo === "firmado") && (
            <p className="text-sm rounded-md bg-muted/50 p-3">Aceptación registrada. Si StockFlex le solicita la copia firmada, imprímala, fírmela y adjúntela abajo.</p>
          )}

          <div className="space-y-2">
            <div className="text-sm font-semibold">Archivos del contrato</div>
            {doc?.docEstado !== "borrador" && contract.status === "ativo" && (
              <ContractUpload contratoId={contract.id} clienteId={client.id} byClient types={["firmado", "anexo"]} onDone={() => { reloadFiles(); qc.invalidateQueries({ queryKey: ["contract-doc", contract.id] }); }} />
            )}
            <ContractFileList files={files} />
            <p className="text-xs text-muted-foreground">Los archivos adjuntados no se pueden modificar ni eliminar desde el portal. Si necesita corregir uno, contacte a StockFlex.</p>
          </div>
        </div>
      )}

      {doc && <AcceptDialog open={accepting} onOpenChange={setAccepting} contract={contract} doc={doc} onDone={() => { qc.invalidateQueries({ queryKey: ["contract-doc", contract.id] }); refresh(); }} />}
    </div>
  );
}

function AcceptDialog({ open, onOpenChange, contract, doc, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; contract: Contract; doc: ContractDocInfo; onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await acceptContract(contract.id, nombre, documento);
      toast.success("Contrato aceptado", { description: "Quedó registrado con su nombre, documento, fecha y usuario." });
      onOpenChange(false); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceptar contrato {contract.numero}</DialogTitle>
          <DialogDescription>Versión {doc.docVersion} emitida el {formatDateTime(doc.docEmitidoAt)}. Debe tener facultad para obligar a la empresa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5"><Label htmlFor="ac-nombre">Nombre y apellido de quien acepta</Label><Input id="ac-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ac-doc">C.I. / documento</Label><Input id="ac-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={ok} onCheckedChange={(v) => setOk(!!v)} className="mt-0.5" />Leí el contrato y lo acepto en nombre de la empresa.</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!ok || busy || nombre.trim().length < 5 || documento.replace(/\D/g, "").length < 5} onClick={submit}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Aceptar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Gestión: condiciones particulares, emisión para firma, impresión, validación de la firma y anexos
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Printer, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Client, Contract } from "@/data/types";
import {
  deleteContractFile, fetchActiveTemplate, fetchContractDoc, fetchContractFiles, fetchSettings, issueContract, markSigned, saveSpecialClauses,
  type ContractFile,
} from "@/data/contractDocs";
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract/defaultTemplate";
import { contractHtml, contractValues, fillTemplate } from "@/lib/contract/render";
import { printContract } from "@/lib/print/contractDoc";
import { formatDateTime } from "@/lib/dates";
import { useStockData } from "@/contexts/StockDataContext";
import { ContractFileList, ContractUpload, DocStateBadge } from "./ContractFiles";
import { toast } from "sonner";

export default function ContractDocDialog({ contract, client, open, onOpenChange }: { contract: Contract | null; client?: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { refresh } = useStockData();
  const id = contract?.id || "";
  const docQ = useQuery({ queryKey: ["contract-doc", id], queryFn: () => fetchContractDoc(id), enabled: open && !!id });
  const filesQ = useQuery({ queryKey: ["contract-files", id], queryFn: () => fetchContractFiles([id]), enabled: open && !!id });
  const tplQ = useQuery({ queryKey: ["contract-template"], queryFn: fetchActiveTemplate, enabled: open });
  const setQ = useQuery({ queryKey: ["app-settings"], queryFn: fetchSettings, enabled: open });
  const [clauses, setClauses] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (docQ.data) setClauses(docQ.data.clausulasEspeciales); }, [docQ.data]);

  const doc = docQ.data;
  const settings = useMemo(() => setQ.data || {}, [setQ.data]);
  const draft = useMemo(() => {
    if (!contract) return { text: "", missing: [] as string[] };
    return fillTemplate(tplQ.data?.cuerpo || DEFAULT_CONTRACT_TEMPLATE, contractValues({ ...contract, clausulasEspeciales: clauses }, client, settings));
  }, [contract, client, settings, tplQ.data, clauses]);

  if (!contract) return null;
  const issued = doc && doc.docEstado !== "borrador" && doc.docTexto;
  const shownText = issued ? doc!.docTexto! : draft.text;
  const files = filesQ.data || [];
  const hasSigned = files.some((f) => f.tipo === "firmado");

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["contract-doc", id] });
    qc.invalidateQueries({ queryKey: ["contract-files", id] });
    refresh();
  };

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  const issue = () => run("issue", async () => {
    if (clauses !== (doc?.clausulasEspeciales || "")) await saveSpecialClauses(id, clauses);
    if (draft.missing.length) throw new Error(`Faltan datos: ${draft.missing.join(", ")}`);
    await issueContract(id, draft.text, tplQ.data?.id);
  }, issued ? "Nueva versión emitida para firma" : "Contrato emitido: el cliente ya puede verlo y aceptarlo en el portal");

  const print = () => printContract({
    texto: shownText, numero: contract.numero, version: issued ? doc!.docVersion : 0, borrador: !issued,
    empresa: settings.empresa_razon_social || "StockFlex", cliente: client?.razaoSocial || "",
    aceptado: doc?.aceptadoAt ? { nombre: doc.aceptadoNombre || "", documento: doc.aceptadoDocumento || "", fecha: doc.aceptadoAt } : null,
  });

  async function remove(f: ContractFile) {
    if (!confirm(`¿Eliminar "${f.nombre}"? Esta acción no se puede deshacer.`)) return;
    run("del", () => deleteContractFile(f), "Archivo eliminado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Documento del contrato {contract.numero} {doc && <DocStateBadge estado={doc.docEstado} />}</DialogTitle>
          <DialogDescription>
            {client?.razaoSocial} · {doc?.docEmitidoAt && doc.docEstado !== "borrador" ? `Versión ${doc.docVersion} emitida ${formatDateTime(doc.docEmitidoAt)}` : "Aún no emitido para firma"}
            {doc?.aceptadoAt && ` · Aceptado por ${doc.aceptadoNombre} (${doc.aceptadoDocumento}) el ${formatDateTime(doc.aceptadoAt)}`}
          </DialogDescription>
        </DialogHeader>

        {docQ.isLoading ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
          <Tabs defaultValue="texto">
            <TabsList><TabsTrigger value="texto">Texto</TabsTrigger><TabsTrigger value="archivos">Archivos ({files.length})</TabsTrigger></TabsList>

            <TabsContent value="texto" className="space-y-4 mt-4">
              <div className="grid gap-1.5">
                <Label htmlFor="cl-esp">Condiciones particulares de este contrato</Label>
                <Textarea id="cl-esp" rows={4} value={clauses} onChange={(e) => setClauses(e.target.value)} placeholder="Ej.: El cliente dispone de 2 posiciones adicionales sin costo durante el primer mes." disabled={doc?.docEstado === "firmado"} />
                <p className="text-xs text-muted-foreground">Se insertan en la cláusula de condiciones particulares. Los demás datos (precio, posiciones, plazo, empresa) se completan solos desde el contrato y el modelo.</p>
              </div>

              {!issued && draft.missing.length > 0 && (
                <div className="rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">Faltan datos para emitir: {draft.missing.join(", ")}. Complete el cliente o los datos de la empresa en «Modelo de contrato».</div>
              )}
              {issued && doc?.docEstado !== "firmado" && (
                <p className="text-xs text-muted-foreground">Se muestra el texto emitido. Si cambia condiciones, «Emitir nueva versión» reemplaza el texto y el cliente deberá aceptar otra vez.</p>
              )}

              <div className="rounded-lg border bg-white text-black p-6 max-h-[420px] overflow-y-auto" style={{ font: "12px/1.5 Georgia, serif" }} dangerouslySetInnerHTML={{ __html: contractHtml(shownText) }} />

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={print}><Printer className="h-4 w-4 mr-1" />Imprimir {issued ? "" : "borrador"}</Button>
                {doc?.docEstado !== "firmado" && (
                  <Button variant={issued ? "outline" : "default"} disabled={!!busy || (!issued && draft.missing.length > 0)} onClick={issue}>
                    {busy === "issue" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}{issued ? "Emitir nueva versión" : "Emitir para firma"}
                  </Button>
                )}
                {issued && doc?.docEstado !== "firmado" && (
                  <Button disabled={!!busy || !hasSigned} title={hasSigned ? "" : "Adjunte primero la copia firmada"} onClick={() => run("sign", () => markSigned(id), "Contrato marcado como firmado")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />Validar firma
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="archivos" className="space-y-4 mt-4">
              <ContractUpload contratoId={id} clienteId={contract.clienteId} byClient={false} types={["firmado", "anexo", "adenda", "otro"]} onDone={reload} />
              <ContractFileList files={files} onDelete={remove} />
              <p className="text-xs text-muted-foreground">El cliente ve estos archivos en su portal y puede agregar copias firmadas o anexos, pero solo la gestión puede eliminarlos.</p>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

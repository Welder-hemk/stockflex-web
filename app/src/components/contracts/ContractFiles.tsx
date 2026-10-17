// Piezas comunes del documento del contrato (gestión y portal del cliente)
import { useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openStorageFile } from "@/data/billing";
import { FILE_TYPE_LABEL, uploadContractFile, type ContractFile } from "@/data/contractDocs";
import { formatDateTime } from "@/lib/dates";
import { toast } from "sonner";

export const DOC_STATE: Record<string, { label: string; cls: string; hint: string }> = {
  borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground", hint: "Aún no emitido para firma" },
  para_firma: { label: "Para firma", cls: "bg-warning/15 text-warning border-warning/40", hint: "Esperando aceptación / firma del cliente" },
  aceptado: { label: "Aceptado", cls: "bg-primary/10 text-primary border-primary/40", hint: "Aceptado en el portal; falta la copia firmada" },
  firmado: { label: "Firmado", cls: "bg-success/15 text-success border-success/40", hint: "Copia firmada validada por StockFlex" },
};

export function DocStateBadge({ estado }: { estado?: string }) {
  const s = DOC_STATE[estado || "borrador"] || DOC_STATE.borrador;
  return <Badge variant="outline" className={s.cls} title={s.hint}>{s.label}</Badge>;
}

export function ContractFileList({ files, onDelete }: { files: ContractFile[]; onDelete?: (f: ContractFile) => void }) {
  if (!files.length) return <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <button className="min-w-0 flex-1 text-left hover:underline" onClick={() => openStorageFile(f.path).catch((e) => toast.error(e.message))}>
            <div className="truncate font-medium">{f.nombre}</div>
            <div className="text-xs text-muted-foreground">{FILE_TYPE_LABEL[f.tipo] || f.tipo} · {formatDateTime(f.createdAt)} · {f.subidoPorCliente ? "subido por el cliente" : "subido por StockFlex"}</div>
          </button>
          {onDelete && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" title="Eliminar" onClick={() => onDelete(f)}><Trash2 className="h-4 w-4" /></Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ContractUpload({ contratoId, clienteId, byClient, types, onDone }: { contratoId: string; clienteId: string; byClient: boolean; types: string[]; onDone: () => void }) {
  const [tipo, setTipo] = useState(types[0]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadContractFile({ contratoId, clienteId, tipo, file, byClient });
      toast.success("Archivo adjuntado", { description: byClient ? "StockFlex revisará el documento. No podrá modificarlo ni eliminarlo después." : undefined });
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={tipo} onValueChange={setTipo}>
        <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
        <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{FILE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
      </Select>
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Adjuntar archivo
      </Button>
      <span className="text-xs text-muted-foreground">PDF o imagen, hasta 5 MB</span>
    </div>
  );
}

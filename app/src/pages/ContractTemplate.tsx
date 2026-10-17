import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStockData } from "@/contexts/StockDataContext";
import { fetchActiveTemplate, fetchSettings, saveSettings, saveTemplate } from "@/data/contractDocs";
import { DEFAULT_CONTRACT_TEMPLATE } from "@/lib/contract/defaultTemplate";
import { contractHtml, contractValues, fillTemplate, PLACEHOLDERS } from "@/lib/contract/render";
import { printContract } from "@/lib/print/contractDoc";
import { formatDateTime } from "@/lib/dates";
import { toast } from "sonner";

const COMPANY_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "empresa_razon_social", label: "Razón social" },
  { key: "empresa_ruc", label: "RUC" },
  { key: "empresa_domicilio", label: "Domicilio" },
  { key: "empresa_representante", label: "Representante legal" },
  { key: "empresa_representante_ci", label: "C.I. del representante" },
  { key: "empresa_email", label: "Correo" },
  { key: "empresa_telefono", label: "Teléfono" },
  { key: "contrato_ciudad", label: "Ciudad de firma" },
  { key: "contrato_jurisdiccion", label: "Jurisdicción", hint: "Ej.: los Juzgados y Tribunales de Ciudad del Este, Alto Paraná" },
  { key: "contrato_mora_pct", label: "Interés por mora (% mensual)" },
];

export default function ContractTemplatePage() {
  const qc = useQueryClient();
  const { contracts, clients } = useStockData();
  const tplQ = useQuery({ queryKey: ["contract-template"], queryFn: fetchActiveTemplate });
  const setQ = useQuery({ queryKey: ["app-settings"], queryFn: fetchSettings });
  const [body, setBody] = useState("");
  const [settings, setSettingsState] = useState<Record<string, string>>({});
  const [sample, setSample] = useState("");
  const [saving, setSaving] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (tplQ.isSuccess) setBody(tplQ.data?.cuerpo || DEFAULT_CONTRACT_TEMPLATE); }, [tplQ.isSuccess, tplQ.data]);
  useEffect(() => { if (setQ.data) setSettingsState(setQ.data); }, [setQ.data]);
  useEffect(() => { if (!sample && contracts.length) setSample(contracts[0].id); }, [contracts, sample]);

  const contract = contracts.find((c) => c.id === sample);
  const client = clients.find((c) => c.id === contract?.clienteId);
  const filled = useMemo(() => contract ? fillTemplate(body, contractValues(contract, client, settings)) : { text: body, missing: [] }, [body, contract, client, settings]);
  const dirty = tplQ.data ? body !== tplQ.data.cuerpo : true;
  const companyMissing = COMPANY_FIELDS.filter((f) => !settings[f.key] || /^\[.*\]/.test(settings[f.key]));

  function insert(key: string) {
    const el = ta.current;
    const tag = `{{${key}}}`;
    if (!el) { setBody(body + tag); return; }
    const { selectionStart: a, selectionEnd: b } = el;
    const next = body.slice(0, a) + tag + body.slice(b);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + tag.length; });
  }

  async function saveAll() {
    setSaving(true);
    try {
      await saveSettings(settings);
      if (dirty) await saveTemplate(body);
      qc.invalidateQueries({ queryKey: ["contract-template"] });
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success(dirty ? "Modelo guardado como nueva versión" : "Datos de la empresa guardados", { description: "Los contratos ya emitidos para firma no cambian." });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  if (tplQ.isLoading || setQ.isLoading) return <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Modelo de contrato</h1>
          <p className="text-sm text-muted-foreground">
            {tplQ.data ? `Versión ${tplQ.data.version} · guardada ${formatDateTime(tplQ.data.updatedAt)}` : "Aún no hay modelo guardado: se muestra el borrador inicial."} Borrador sujeto a revisión legal.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { if (confirm("¿Volver al borrador inicial? Perderá los cambios no guardados.")) setBody(DEFAULT_CONTRACT_TEMPLATE); }}><RotateCcw className="h-4 w-4 mr-1" />Borrador inicial</Button>
          <Button variant="outline" disabled={!contract} onClick={() => contract && printContract({ texto: filled.text, numero: contract.numero, version: 0, borrador: true, empresa: settings.empresa_razon_social || "StockFlex", cliente: client?.razaoSocial || "" })}><Printer className="h-4 w-4 mr-1" />Vista de impresión</Button>
          <Button onClick={saveAll} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Guardar</Button>
        </div>
      </div>

      {companyMissing.length > 0 && (
        <div className="rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">Complete los datos de la empresa: {companyMissing.map((f) => f.label).join(", ")}. Sin ellos no se puede emitir un contrato para firma.</div>
      )}

      <Tabs defaultValue="texto">
        <TabsList><TabsTrigger value="texto">Texto del contrato</TabsTrigger><TabsTrigger value="empresa">Datos de la empresa</TabsTrigger></TabsList>
        <TabsContent value="texto" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-body">Texto (# título, ## cláusula, - ítem, **negrita**)</Label>
              <Textarea id="tpl-body" ref={ta} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs min-h-[620px]" />
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold mb-2">Campos automáticos (toque para insertar en el cursor)</div>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button key={p.key} type="button" title={`{{${p.key}}}`} onClick={() => insert(p.key)} className="text-[11px] rounded border px-2 py-1 hover:bg-muted">{p.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Vista previa con el contrato</Label>
                <Select value={sample} onValueChange={setSample}>
                  <SelectTrigger className="w-64 h-9"><SelectValue placeholder="Elegir contrato" /></SelectTrigger>
                  <SelectContent>{contracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.numero} · {clients.find((x) => x.id === c.clienteId)?.nomeFantasia}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {filled.missing.length > 0 && <p className="text-xs text-warning">Sin dato: {filled.missing.join(", ")} (resaltado en la vista previa).</p>}
              <div className="rounded-lg border bg-white text-black p-6 max-h-[720px] overflow-y-auto" style={{ font: "12px/1.5 Georgia, serif" }} dangerouslySetInnerHTML={{ __html: contractHtml(filled.text) }} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="empresa" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2 max-w-3xl">
            {COMPANY_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={`st-${f.key}`}>{f.label}</Label>
                <Input id={`st-${f.key}`} value={settings[f.key] || ""} onChange={(e) => setSettingsState({ ...settings, [f.key]: e.target.value })} />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

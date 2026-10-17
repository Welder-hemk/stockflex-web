import { parseDecimal } from "@/lib/formatters";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useStockData } from "@/contexts/StockDataContext";
import { rpcRegisterPalletEntry } from "@/data/dbMutations";
import { formatNumber } from "@/lib/formatters";
import { toast } from "sonner";
import { fetchPallets, labelFor, printMovements } from "@/data/operations";
import { printLabels } from "@/lib/print/documents";
import { parseDbError } from "@/lib/errorMessages";
import { useState, useEffect, useRef, useMemo } from "react";
import { Printer, QrCode, Lightbulb } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { isGroundPosition } from "@/data/types";

const schema = z.object({
  clienteId: z.string().min(1, "Seleccione un cliente"),
  contratoId: z.string().min(1, "Seleccione un contrato"),
  descricao: z.string().trim().min(2, "Mínimo 2 caracteres").max(200, "Máximo 200 caracteres"),
  peso: z.coerce.number().min(0.1, "El peso debe ser mayor que cero"),
  valorDeclarado: z.coerce.number().min(0, "Valor inválido"),
  localizacao: z.string().trim().min(3, "Ubicación obligatoria").max(20, "Máximo 20 caracteres"),
  largo: z.coerce.number().min(1, "Obligatorio"),
  ancho: z.coerce.number().min(1, "Obligatorio"),
  alto: z.coerce.number().min(1, "Obligatorio"),
  seguro: z.boolean().default(true),
  observacoes: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

function toComma(val: number | string, decimals = 2): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0,00';
  return num.toFixed(decimals).replace('.', ',');
}
function fromComma(val: string): number { const n = parseDecimal(val); return isNaN(n) ? 0 : n; }

function CommaInput({ value, onChange, placeholder, inputMode }: { value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: string }) {
  return (
    <Input type="text" inputMode={inputMode as any || "decimal"} value={value}
      onChange={e => onChange(e.target.value.replace(/[^0-9,.-]/g, ''))}
      onBlur={() => onChange(toComma(fromComma(value)))}
      placeholder={placeholder} />
  );
}

export default function PalletForm({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { clients, contracts, pallets, warehousePositions, suggestPosition, suggestContiguousPositions, findContiguousPosition, generatePalletCode, refresh, authorizedContacts } = useStockData();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [savedData, setSavedData] = useState<FormValues | null>(null);
  const [savedPalletId, setSavedPalletId] = useState<string | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [capacityWarning, setCapacityWarning] = useState(false);
  const [pendingPalletData, setPendingPalletData] = useState<FormValues | null>(null);
  const [weightWarning, setWeightWarning] = useState(false);
  const [pendingWeightData, setPendingWeightData] = useState<FormValues | null>(null);
  const [palletDuplo, setPalletDuplo] = useState(false);
  const [localizacao2, setLocalizacao2] = useState('');
  const [saving, setSaving] = useState(false);

  const [pesoStr, setPesoStr] = useState('0,00');
  const [valorStr, setValorStr] = useState('0,00');
  const [largoStr, setLargoStr] = useState('120,00');
  const [anchoStr, setAnchoStr] = useState('100,00');
  const [altoStr, setAltoStr] = useState('0,00');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { clienteId: "", contratoId: "", descricao: "", peso: 0, valorDeclarado: 0, localizacao: "", observacoes: "", largo: 120, ancho: 100, alto: 0, seguro: true },
  });

  const selectedClientId = form.watch("clienteId");
  const filteredContracts = contracts.filter(c => c.clienteId === selectedClientId && c.status === 'ativo');
  const freePositions = useMemo(() => warehousePositions.filter(p => p.status === 'free').map(p => p.id), [warehousePositions]);

  const currentPeso = fromComma(pesoStr);

  useEffect(() => {
    if (selectedClientId) {
      setGeneratedCode(generatePalletCode());
      if (palletDuplo) {
        const pair = suggestContiguousPositions(selectedClientId);
        if (pair) { form.setValue("localizacao", pair[0].id); setLocalizacao2(pair[1].id); }
      } else {
        const suggested = suggestPosition(selectedClientId, currentPeso);
        if (suggested) form.setValue("localizacao", suggested.id);
        setLocalizacao2('');
      }
    } else { setGeneratedCode(null); form.setValue("localizacao", ""); setLocalizacao2(''); }
  }, [selectedClientId, palletDuplo, currentPeso > 1000]);

  useEffect(() => { form.setValue("peso", fromComma(pesoStr)); }, [pesoStr]);
  useEffect(() => { form.setValue("valorDeclarado", fromComma(valorStr)); }, [valorStr]);
  useEffect(() => { form.setValue("largo", fromComma(largoStr)); }, [largoStr]);
  useEffect(() => { form.setValue("ancho", fromComma(anchoStr)); }, [anchoStr]);
  useEffect(() => { form.setValue("alto", fromComma(altoStr)); }, [altoStr]);

  function onSubmit(data: FormValues) {
    const positionsNeeded = palletDuplo ? 2 : 1;
    const contract = contracts.find(c => c.id === data.contratoId);
    if (contract) {
      const contractOccupied = pallets.filter(p => p.contratoId === data.contratoId && p.status === 'armazenado')
        .reduce((sum, p) => sum + (p.palletDuplo ? 2 : 1), 0);
      if (contractOccupied + positionsNeeded > contract.posicoesContratadas) {
        setPendingPalletData(data); setCapacityWarning(true); return;
      }
    }
    if (palletDuplo) {
      const pos1 = warehousePositions.find(p => p.id === data.localizacao);
      const pos2 = warehousePositions.find(p => p.id === localizacao2);
      if (!pos1 || pos1.status !== 'free' || !pos2 || pos2.status !== 'free') {
        toast.error("Ambas posiciones deben estar libres para pallet duplo"); return;
      }
    }
    checkWeightAndSave(data);
  }

  function checkWeightAndSave(data: FormValues) {
    if (data.peso > 1200 && !isGroundPosition(data.localizacao)) {
      setPendingWeightData(data); setWeightWarning(true); return;
    }
    doSavePallet(data);
  }

  async function doSavePallet(data: FormValues) {
    setSaving(true);
    try {
      const result = await rpcRegisterPalletEntry({
        clienteId: data.clienteId,
        contratoId: data.contratoId,
        // Código definitivo gerado pelo banco (evita códigos repetidos entre dois operadores)
        sku: '',
        descricao: data.descricao,
        peso: data.peso,
        valorDeclarado: data.valorDeclarado,
        localizacao: data.localizacao,
        localizacao2: palletDuplo ? localizacao2 : undefined,
        largo: data.largo,
        ancho: data.ancho,
        alto: data.alto,
        seguro: data.seguro,
        palletDuplo: palletDuplo,
        positionId: data.localizacao,
        position2Id: palletDuplo ? localizacao2 : undefined,
        operador: user?.nome || 'Sistema',
        operadorId: user?.id,
      });

      const palletId = result.pallet_id;
      await refresh();
      setSavedData(data); setSavedPalletId(palletId); setGeneratedCode(result.sku);
      setShowLabel(true);
      toast.success("¡Pallet registrado!", { description: `${result.sku} — ${data.descricao}` });

      // Comprovante + etiqueta com os dados reais gravados no banco
      printMovements([result.movement_id], { clients, contracts, authorizedContacts }, { labels: true })
        .catch((err) => toast.error("No se pudo imprimir", { description: parseDbError(err) }));
    } catch (e: unknown) {
      toast.error(parseDbError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handlePrintLabel() {
    if (!savedPalletId) return;
    try {
      const [p] = await fetchPallets([savedPalletId]);
      if (p) await printLabels([labelFor(p, { clients, contracts, authorizedContacts })]);
    } catch (err) {
      toast.error("No se pudo imprimir", { description: parseDbError(err) });
    }
  }

  function handleClose() {
    setShowLabel(false); setSavedData(null); setSavedPalletId(null); setGeneratedCode(null);
    setPalletDuplo(false); setLocalizacao2('');
    setPesoStr('0,00'); setValorStr('0,00'); setLargoStr('120,00'); setAnchoStr('100,00'); setAltoStr('0,00');
    form.reset(); onOpenChange(false);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{showLabel ? "Pallet Registrado" : "Nuevo Pallet"}</DialogTitle></DialogHeader>

        {showLabel && savedData && generatedCode ? (
          <div className="space-y-4">
            <div ref={labelRef} className="flex justify-center">
              <div className="label border-[3px] border-foreground p-6 w-full max-w-[600px]">
                <div className="text-center border-b-2 border-foreground pb-2 mb-3">
                  <div className="text-xs font-bold uppercase text-muted-foreground">StockFlex WMS</div>
                  <div className="text-[10px] text-muted-foreground">Etiqueta de Pallet</div>
                </div>
                <div className="text-center mb-2">
                  <div className="text-2xl font-bold font-mono tracking-wider border-2 border-foreground inline-block px-4 py-1">
                    {contracts.find(c => c.id === savedData.contratoId)?.numero || ''}
                  </div>
                </div>
                <div className="text-center mb-3">
                  <div className="text-xl font-bold font-mono tracking-wider">{generatedCode}</div>
                </div>
                <div className="text-sm text-left leading-relaxed px-4 space-y-0.5">
                  <div><strong className="inline-block w-[100px]">Cliente:</strong> {clients.find(c => c.id === savedData.clienteId)?.nomeFantasia || ''}</div>
                  <div><strong className="inline-block w-[100px]">Descripción:</strong> {savedData.descricao}</div>
                  <div><strong className="inline-block w-[100px]">Peso:</strong> {formatNumber(savedData.peso, 2)} kg</div>
                  <div><strong className="inline-block w-[100px]">Tamaño:</strong> {formatNumber(savedData.largo, 2)}×{formatNumber(savedData.ancho, 2)}×{formatNumber(savedData.alto, 2)} cm</div>
                  <div><strong className="inline-block w-[100px]">Ubicación:</strong> {savedData.localizacao}</div>
                </div>
                <div className="border-t-2 border-foreground mt-3 pt-2 text-center">
                  <div className="text-[9px] text-muted-foreground uppercase">Registro PLT</div>
                  <div className="text-[11px] font-mono text-muted-foreground tracking-wider">{generatedCode}</div>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={handlePrintLabel}><Printer className="h-4 w-4 mr-2" /> Imprimir Etiqueta</Button>
              <Button variant="outline" onClick={handleClose}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {generatedCode && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
                  <QrCode className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-xs text-muted-foreground">Código del Pallet</div>
                    <div className="text-lg font-bold font-mono tracking-wider text-primary">{generatedCode}</div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="clienteId" render={({ field }) => (
                  <FormItem><FormLabel>Cliente *</FormLabel>
                    <Select onValueChange={(v) => { field.onChange(v); form.setValue("contratoId", ""); }} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                      <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia} ({c.codigo})</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contratoId" render={({ field }) => (
                  <FormItem><FormLabel>Contrato *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedClientId}>
                      <FormControl><SelectTrigger><SelectValue placeholder={selectedClientId ? "Seleccione..." : "Seleccione el cliente primero"} /></SelectTrigger></FormControl>
                      <SelectContent>{filteredContracts.map(c => <SelectItem key={c.id} value={c.id}>{c.numero}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="descricao" render={({ field }) => (
                  <FormItem><FormLabel>Descripción *</FormLabel><FormControl><Input placeholder="Ej: Arroz 5kg" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="peso" render={() => (
                  <FormItem><FormLabel>Peso (kg) *</FormLabel><FormControl><CommaInput value={pesoStr} onChange={setPesoStr} placeholder="0,00" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="valorDeclarado" render={() => (
                  <FormItem><FormLabel>Valor Declarado (USD)</FormLabel><FormControl><CommaInput value={valorStr} onChange={setValorStr} placeholder="0,00" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="col-span-1 md:col-span-2">
                  <label className="text-sm font-medium leading-none mb-2 block">Tamaño del Pallet (cm) *</label>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField control={form.control} name="largo" render={() => (
                      <FormItem><FormControl><CommaInput value={largoStr} onChange={setLargoStr} placeholder="120,00" /></FormControl><div className="text-[10px] text-muted-foreground text-center">Largo</div><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="ancho" render={() => (
                      <FormItem><FormControl><CommaInput value={anchoStr} onChange={setAnchoStr} placeholder="100,00" /></FormControl><div className="text-[10px] text-muted-foreground text-center">Ancho</div><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="alto" render={() => (
                      <FormItem><FormControl><CommaInput value={altoStr} onChange={setAltoStr} placeholder="0,00" /></FormControl><div className="text-[10px] text-muted-foreground text-center">Alto</div><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <Checkbox checked={palletDuplo} onCheckedChange={(v) => setPalletDuplo(!!v)} />
                    <div className="space-y-1 leading-none">
                      <label className="text-sm font-medium leading-none">Pallet Duplo</label>
                      <p className="text-xs text-muted-foreground">Este pallet ocupa 2 posiciones contiguas</p>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <FormField control={form.control} name="localizacao" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">Ubicación 1 *
                        {selectedClientId && <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Sugerida</span>}
                      </FormLabel>
                      <Select onValueChange={(v) => { field.onChange(v); if (palletDuplo) { const adj = findContiguousPosition(v); setLocalizacao2(adj?.id || ''); } }} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccione posición libre" /></SelectTrigger></FormControl>
                        <SelectContent className="max-h-60">{freePositions.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )} />
                  {palletDuplo && (
                    <div className="mt-2">
                      <label className="text-sm font-medium">Ubicación 2 (contigua)</label>
                      <Input value={localizacao2} readOnly className="bg-muted mt-1" placeholder={localizacao2 || "Sin posición contigua"} />
                      {!localizacao2 && <p className="text-xs text-destructive mt-1">No hay posición contigua libre</p>}
                    </div>
                  )}
                </div>
              </div>
              <FormField control={form.control} name="observacoes" render={({ field }) => (
                <FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Información adicional..." rows={3} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="seguro" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Seguro de Mercadería</FormLabel>
                    <p className="text-xs text-muted-foreground">Aplicar seguro según el porcentaje del contrato</p>
                  </div>
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar Pallet'}</Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={capacityWarning} onOpenChange={setCapacityWarning}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Posiciones Excedidas</AlertDialogTitle>
          <AlertDialogDescription>El cliente excederá las posiciones contratadas. ¿Desea continuar?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setCapacityWarning(false); setPendingPalletData(null); }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setCapacityWarning(false); if (pendingPalletData) checkWeightAndSave(pendingPalletData); setPendingPalletData(null); }}>Continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={weightWarning} onOpenChange={setWeightWarning}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>⚠ Peso Excesivo en Posición Elevada</AlertDialogTitle>
          <AlertDialogDescription>{`Peso ${formatNumber(pendingWeightData?.peso || 0, 2)} kg en posición elevada ${pendingWeightData?.localizacao}. Límite: 1.200 kg. ¿Continuar?`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setWeightWarning(false); setPendingWeightData(null); }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setWeightWarning(false); if (pendingWeightData) doSavePallet(pendingWeightData); setPendingWeightData(null); }}>Continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

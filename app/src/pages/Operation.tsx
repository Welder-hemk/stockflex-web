import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Warehouse as WarehouseIcon } from "lucide-react";
import { useStockData } from "@/contexts/StockDataContext";
import { PackagePlus, PackageMinus, MoveRight, ClipboardList, Printer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EntryPanel from "@/components/operation/EntryPanel";
import ExitPanel from "@/components/operation/ExitPanel";
import TransferPanel from "@/components/operation/TransferPanel";
import PendingPanel, { usePendingMovements } from "@/components/operation/PendingPanel";
import { getLabelFormat, setLabelFormat, type LabelFormat } from "@/lib/print/printer";

const AUTO_KEY = "sf-auto-print";
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
};

export default function Operation() {
  const [params] = useSearchParams();
  const initialTab = ["entrada", "saida", "transferencia", "pendentes"].includes(params.get("tab") || "") ? params.get("tab")! : "entrada";
  const [tab, setTab] = useState(initialTab);
  const palletParam = params.get("pallet") || undefined;
  const posParam = params.get("pos") || undefined;
  const { warehouses, currentWarehouseId, setCurrentWarehouseId, multiWarehouse } = useStockData();
  const [autoPrint, setAutoPrint] = useState(readAuto);
  const [format, setFormat] = useState<LabelFormat>(getLabelFormat);
  const { data } = usePendingMovements();
  const pendingCount = data?.movements.length ?? 0;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Operación de depósito</h1>
          <p className="text-sm text-muted-foreground">Ingreso, salida y transferencia con lector de código. Las posiciones cortas (A-01-1-1) se buscan en el depósito elegido.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {multiWarehouse && (
            <Select value={currentWarehouseId || ""} onValueChange={setCurrentWarehouseId}>
              <SelectTrigger className="h-9 w-[230px] font-medium"><WarehouseIcon className="h-4 w-4 mr-1" /><SelectValue placeholder="Depósito" /></SelectTrigger>
              <SelectContent>{warehouses.filter((w) => w.active).map((w) => <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2">
            <Switch
              checked={autoPrint}
              onCheckedChange={(v) => {
                setAutoPrint(v);
                try { localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch { /* ignora */ }
              }}
            />
            <Printer className="h-4 w-4" /> Imprimir automáticamente
          </label>
          <Select value={format} onValueChange={(v) => { setFormat(v as LabelFormat); setLabelFormat(v as LabelFormat); }}>
            <SelectTrigger className="h-9 w-[250px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a4half">Etiqueta en hoja A4 (2 por hoja)</SelectItem>
              <SelectItem value="thermal100x150">Etiqueta térmica 100×150 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 h-auto w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="entrada" className="py-2 gap-1 flex-col sm:flex-row"><PackagePlus className="h-4 w-4" /><span className="text-xs sm:text-sm">Ingreso</span></TabsTrigger>
          <TabsTrigger value="saida" className="py-2 gap-1 flex-col sm:flex-row"><PackageMinus className="h-4 w-4" /><span className="text-xs sm:text-sm">Salida</span></TabsTrigger>
          <TabsTrigger value="transferencia" className="py-2 gap-1 flex-col sm:flex-row"><MoveRight className="h-4 w-4" /><span className="text-xs sm:text-sm">Transferencia</span></TabsTrigger>
          <TabsTrigger value="pendentes" className="py-2 gap-1 flex-col sm:flex-row">
            <ClipboardList className="h-4 w-4" /><span className="text-xs sm:text-sm">Pendientes</span>
            {pendingCount > 0 && <span className="ml-1 rounded-full bg-destructive text-destructive-foreground text-xs px-1.5">{pendingCount}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entrada"><EntryPanel autoPrint={autoPrint} initialPosition={posParam} /></TabsContent>
        <TabsContent value="saida"><ExitPanel autoPrint={autoPrint} initialCode={initialTab === "saida" ? palletParam : undefined} /></TabsContent>
        <TabsContent value="transferencia"><TransferPanel autoPrint={autoPrint} initialCode={initialTab === "transferencia" ? palletParam : undefined} /></TabsContent>
        <TabsContent value="pendentes"><PendingPanel autoPrint={autoPrint} /></TabsContent>
      </Tabs>
    </div>
  );
}

// Campo de posición: viene con la sugerida, se puede escribir/escanear o elegir de la lista de libres.
import { useMemo, useState } from "react";
import { ChevronsUpDown, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useStockData } from "@/contexts/StockDataContext";
import { resolvePositionId } from "@/data/operations";
import { positionCode, type WarehousePosition } from "@/data/types";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Props {
  value: string; // id completo (CDE1:A-01-1-1)
  onChange: (id: string, manual: boolean) => void;
  suggested?: string;
  peso?: number;
  /** solo posiciones con vecina libre (pallet doble) */
  needPair?: boolean;
  /** posiciones ya tomadas por otras filas */
  exclude?: Set<string>;
  className?: string;
  inputClassName?: string;
  id?: string;
  compact?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const LEVEL = (n: number) => (n === 1 ? "suelo" : `nivel ${n}`);

export default function PositionPicker({ value, onChange, suggested, peso = 0, needPair, exclude, className, inputClassName, id, compact, onKeyDown }: Props) {
  const { currentPositions, currentWarehouse } = useStockData();
  const [open, setOpen] = useState(false);
  const wh = currentWarehouse?.code;
  const short = (pid: string) => (wh && pid.startsWith(`${wh}:`) ? positionCode(pid) : pid);

  const neighborFree = (p: WarehousePosition) =>
    currentPositions.some((o) => o.rua === p.rua && o.bloco === p.bloco && o.nivel === p.nivel && o.posicao === (p.posicao === 1 ? 2 : 1) && o.status === "free" && !exclude?.has(o.id));

  // Libres que soportan el peso, agrupadas por calle
  const groups = useMemo(() => {
    const free = currentPositions
      .filter((p) => p.status === "free" && (p.capacidadeKg || 0) >= peso && (!exclude?.has(p.id) || p.id === value) && (!needPair || neighborFree(p)))
      .sort((a, b) => a.rua.localeCompare(b.rua, "es", { numeric: true }) || a.bloco - b.bloco || a.nivel - b.nivel || a.posicao - b.posicao);
    const m = new Map<string, WarehousePosition[]>();
    for (const p of free) m.set(p.rua, [...(m.get(p.rua) || []), p]);
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPositions, peso, exclude, needPair, value]);
  const total = groups.reduce((s, [, l]) => s + l.length, 0);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Input
        id={id}
        className={cn("font-mono uppercase", compact ? "h-9" : "h-11 text-lg max-w-[180px]", inputClassName)}
        value={short(value)}
        placeholder="A-01-1-1"
        onChange={(e) => onChange(e.target.value ? resolvePositionId(e.target.value, wh) : "", true)}
        onKeyDown={onKeyDown}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size={compact ? "icon" : "default"} className={cn(compact ? "h-9 w-9 shrink-0" : "h-11")} title="Elegir posición libre">
            {compact ? <ChevronsUpDown className="h-4 w-4" /> : <><MapPin className="h-4 w-4 mr-1" />Elegir ({total})</>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar: A-03, nivel…" />
            <CommandList className="max-h-72">
              <CommandEmpty>{peso > 0 ? `Ninguna posición libre soporta ${formatNumber(peso)} kg` : "Sin posiciones libres"}</CommandEmpty>
              {suggested && (
                <CommandGroup heading="Sugerida">
                  <CommandItem value={`sugerida ${short(suggested)}`} onSelect={() => { onChange(suggested, false); setOpen(false); }}>
                    <Star className="h-4 w-4 mr-2 text-amber-500" /><span className="font-mono">{short(suggested)}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {groups.map(([rua, list]) => (
                <CommandGroup key={rua} heading={`Calle ${rua} · ${list.length} libres`}>
                  {list.map((p) => (
                    <CommandItem key={p.id} value={`${p.code} ${LEVEL(p.nivel)}`} onSelect={() => { onChange(p.id, p.id !== suggested); setOpen(false); }} className={cn(p.id === value && "bg-accent")}>
                      <span className="font-mono w-24">{p.code}</span>
                      <span className="text-xs text-muted-foreground flex-1">{LEVEL(p.nivel)}</span>
                      <span className="text-xs text-muted-foreground">{formatNumber(p.capacidadeKg)} kg</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

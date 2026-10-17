import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SortableHeaderProps {
  field: string;
  currentField: string;
  direction: 'asc' | 'desc';
  onToggle: (field: string) => void;
  children: React.ReactNode;
  className?: string;
}

export default function SortableHeader({ field, currentField, direction, onToggle, children, className }: SortableHeaderProps) {
  const isActive = currentField === field;
  return (
    <TableHead className={cn("cursor-pointer select-none", className)} onClick={() => onToggle(field)}>
      <span className="flex items-center">
        {children}
        {isActive
          ? (direction === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />)
          : <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
        }
      </span>
    </TableHead>
  );
}

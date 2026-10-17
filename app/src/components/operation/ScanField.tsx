import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Camera, ScanLine, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CameraScanner, { cameraScanSupported } from "./CameraScanner";
import { cn } from "@/lib/utils";

export interface ScanFieldHandle {
  focus: () => void;
}

interface Props {
  placeholder: string;
  onScan: (code: string) => void | Promise<void>;
  busy?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Campo de leitura: a pistola digita o código e envia Enter.
 * Também aceita digitação manual e, quando o navegador permite, a câmera do celular.
 */
const ScanField = forwardRef<ScanFieldHandle, Props>(({ placeholder, onScan, busy, autoFocus = true, className }, ref) => {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

  const submit = async (code: string) => {
    const v = code.trim();
    if (!v || busy) return;
    setValue("");
    await onScan(v);
    inputRef.current?.focus();
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <div className="relative flex-1">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit(value);
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          className="h-12 pl-10 text-lg font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-base"
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
      <Button type="button" variant="secondary" className="h-12" onClick={() => submit(value)} disabled={!value.trim() || busy}>
        OK
      </Button>
      {cameraScanSupported() && (
        <Button type="button" variant="outline" className="h-12 w-12 p-0" onClick={() => setCameraOpen(true)} aria-label="Leer con la cámara">
          <Camera className="h-5 w-5" />
        </Button>
      )}
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetected={(c) => submit(c)} />
    </div>
  );
});
ScanField.displayName = "ScanField";
export default ScanField;

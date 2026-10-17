import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Leitura pela câmera usando o leitor nativo do navegador (Chrome/Edge no Android e desktop).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Detector: any = typeof window !== "undefined" ? (window as any).BarcodeDetector : undefined;

export const cameraScanSupported = () => !!Detector && !!navigator.mediaDevices?.getUserMedia;

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export default function CameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Callbacks em ref: a câmera não reinicia a cada renderização do pai
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;

    (async () => {
      try {
        const detector = new Detector({ formats: ["code_128", "qr_code", "ean_13", "code_39"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found?.[0]?.rawValue) {
              stopped = true;
              onDetectedRef.current(found[0].rawValue);
              onCloseRef.current();
              return;
            }
          } catch {
            /* quadro ilegível: tenta o próximo */
          }
          timer = window.setTimeout(tick, 180);
        };
        tick();
      } catch {
        setError("No fue posible acceder a la cámara. Verifique el permiso del navegador.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      setError(null);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leer código con la cámara</DialogTitle>
          <DialogDescription>Apunte a la etiqueta del pallet o de la posición.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded-md bg-black aspect-[4/3] object-cover" muted playsInline />
        )}
      </DialogContent>
    </Dialog>
  );
}

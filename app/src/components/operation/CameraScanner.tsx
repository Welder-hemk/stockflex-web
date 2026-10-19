import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Leitura pela câmera: usa o leitor nativo do navegador quando existe (Chrome/Android)
// e, nos demais (iPhone/Safari, Firefox), lê o QR quadro a quadro com o jsQR.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Detector: any = typeof window !== "undefined" ? (window as any).BarcodeDetector : undefined;

export const cameraScanSupported = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

type Reader = (video: HTMLVideoElement) => Promise<string | null>;

async function makeReader(): Promise<Reader> {
  if (Detector) {
    try {
      const formats: string[] = (await Detector.getSupportedFormats?.()) || [];
      if (!formats.length || formats.includes("qr_code")) {
        const detector = new Detector({ formats: ["qr_code", "code_128", "ean_13", "code_39"].filter((f) => !formats.length || formats.includes(f)) });
        return async (v) => (await detector.detect(v))?.[0]?.rawValue || null;
      }
    } catch { /* cai no jsQR */ }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (v) => {
    if (!v.videoWidth) return null;
    const scale = Math.min(1, 640 / v.videoWidth); // imagem menor = leitura mais rápida no celular
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

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
        const read = await makeReader();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const code = await read(videoRef.current);
            if (code) {
              stopped = true;
              if (navigator.vibrate) navigator.vibrate(80);
              onDetectedRef.current(code);
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
          <DialogDescription>Apunte al código QR de la etiqueta del pallet o de la posición.</DialogDescription>
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

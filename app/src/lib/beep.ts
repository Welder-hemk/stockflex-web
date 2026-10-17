// Sinal sonoro curto para a leitura de códigos: o operador sabe se deu certo sem olhar a tela.
let ctx: AudioContext | null = null;

export function beep(kind: "ok" | "error" = "ok") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = kind === "ok" ? 1200 : 220;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === "ok" ? 0.08 : 0.35));
  } catch {
    /* sem áudio: segue em silêncio */
  }
  if (kind === "error" && "vibrate" in navigator) navigator.vibrate?.(200);
}

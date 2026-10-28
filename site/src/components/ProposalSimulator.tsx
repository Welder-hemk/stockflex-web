import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, Loader2, MessageCircle, Plus, Trash2, Info, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PRICING, fitsPosition, money, proposalNumber, quote, tierPriceFor, type PalletLine } from "@/lib/pricing";
import { proposalText } from "@/lib/proposalText";
import { submitLead } from "@/lib/leads";
import { trackEvent } from "@/lib/analytics";
import { trackProposal, trackSimulator, trackWhatsApp } from "@/lib/tracker";
import { Checkbox } from "@/components/ui/checkbox";
import { WHATSAPP_NUMBER } from "@/components/WhatsAppFloat";

const num = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
};
const dec = (n: number) => String(n).replace(".", ",");

interface LineState {
  id: number;
  quantity: string;
  length: string;
  width: string;
  height: string;
  declared: string;
}

const standardLine = (id: number, quantity = "20"): LineState => ({
  id,
  quantity,
  length: dec(PRICING.standard.length),
  width: dec(PRICING.standard.width),
  height: dec(PRICING.standard.height),
  declared: "",
});

const TERM_CHIPS = [1, 3, 6, 12, 24];

export default function ProposalSimulator() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("pt") ? "pt" : "es";
  const T = proposalText(lang);
  const { toast } = useToast();

  const [lines, setLines] = useState<LineState[]>([standardLine(1)]);
  const [months, setMonths] = useState("12");
  const [client, setClient] = useState({ name: "", company: "", email: "", phone: "", taxId: "" });
  const [consent, setConsent] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const lastSaved = useRef("");
  const [busy, setBusy] = useState(false);
  const [lastNumber, setLastNumber] = useState<string | null>(null);

  const parsed: PalletLine[] = lines.map((l) => ({
    quantity: Math.max(0, Math.floor(num(l.quantity))),
    length: num(l.length),
    width: num(l.width),
    height: num(l.height),
    declaredValue: num(l.declared),
  }));
  const q = useMemo(() => quote(parsed, num(months)), [JSON.stringify(parsed), months]); // eslint-disable-line react-hooks/exhaustive-deps

  // Próxima faixa de quantidade (incentivo honesto)
  const nextTier = PRICING.quantityTiers.find((t) => t.from > q.totalPositions);

  const update = (id: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => (ls.length >= 5 ? ls : [...ls, standardLine(Date.now(), "10")]));

  const clientOk = client.name.trim().length > 1 && client.company.trim().length > 1 && /\S+@\S+\.\S+/.test(client.email) && client.phone.replace(/\D/g, "").length >= 7;
  const canQuote = q.totalPositions > 0 || q.needsConsultation;

  const simDetails = () => ({
    months: q.months,
    totalPositions: q.totalPositions,
    totalMonthly: q.totalMonthly,
    totalContract: q.totalContract,
    needsConsultation: q.needsConsultation,
    lines: q.lines.map((x) => ({ ...x.line, pricePerPosition: x.pricePerPosition, volume: x.volume })),
    consultLines: q.consultLines,
  });
  const leadData = () => ({
    name: client.name,
    company: client.company,
    taxId: client.taxId,
    email: client.email,
    phone: client.phone,
    palletQuantity: String(q.totalPositions),
    consent,
  });

  // Registra no histórico do visitante cada mudança na simulação
  const simSignature = `${q.totalPositions}|${q.months}|${q.totalMonthly}|${q.consultLines.length}`;
  useEffect(() => {
    const t = window.setTimeout(() => trackSimulator(q.totalPositions), 800);
    return () => window.clearTimeout(t);
  }, [simSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Com os dados básicos completos, a simulação é guardada sozinha (sem precisar baixar o PDF)
  useEffect(() => {
    if (!clientOk || !canQuote) return;
    const sig = `${client.email.trim().toLowerCase()}|${simSignature}|${consent}`;
    if (sig === lastSaved.current) return;
    const t = window.setTimeout(async () => {
      const ok = await submitLead("simulation", { ...leadData(), message: `${q.totalPositions} pos · ${q.months} m · ${money(q.totalMonthly, lang)}/mes` }, lang, { details: simDetails() });
      if (ok) {
        lastSaved.current = sig;
        setSavedAt(new Date().toLocaleTimeString(lang === "pt" ? "pt-BR" : "es-PY", { hour: "2-digit", minute: "2-digit" }));
      }
    }, 2500);
    return () => window.clearTimeout(t);
  }, [clientOk, canQuote, client.email, client.name, client.company, client.phone, simSignature, consent]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(sendWhatsApp: boolean) {
    if (!canQuote) return;
    if (!clientOk) {
      toast({ title: T.required, variant: "destructive" });
      return;
    }
    // A janela do WhatsApp precisa abrir no próprio clique, senão o navegador bloqueia
    const waWin = sendWhatsApp ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    const number = lastNumber || proposalNumber();
    try {
      const { buildProposalPdf } = await import("@/lib/proposalPdf");
      const blob = await buildProposalPdf(q, client, number, lang);
      // Grava como contato; se o banco falhar, a proposta sai do mesmo jeito
      submitLead(
        q.needsConsultation ? "quote" : "proposal",
        { ...leadData(), message: `${T.pdfTitle} ${number} — ${money(q.totalMonthly, lang)}/mes · ${q.months} meses` },
        lang,
        { proposalNumber: number, details: simDetails() },
      ).catch(() => undefined);
      trackProposal();
      if (sendWhatsApp) trackWhatsApp();
      trackEvent("proposal_generated", { positions: q.totalPositions, months: q.months, value: q.totalMonthly, currency: "USD" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Propuesta-StockFlex-${number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setLastNumber(number);

      if (sendWhatsApp) {
        const msg = `${T.waMessage(number)}\n${q.totalPositions} ${T.positions} · ${T.months(q.months)} · ${money(q.totalMonthly, lang)} / mes`;
        const waUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(msg)}`;
        if (waWin) waWin.location.href = waUrl;
        else window.location.href = waUrl;
      }
      toast({ title: T.done, description: `${T.pdfNumber} ${number}` });
    } catch (e) {
      waWin?.close();
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="simulador" className="border-2 border-industrial-orange shadow-hero overflow-hidden scroll-mt-20">
      <div className="bg-industrial-orange text-white text-center px-6 py-5">
        <h3 className="text-2xl md:text-3xl font-bold">{T.simTitle}</h3>
        <p className="opacity-90 mt-1">{T.simSubtitle}</p>
      </div>
      <CardContent className="p-5 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          {/* Entradas */}
          <div className="space-y-5">
            {lines.map((l, i) => (
              <div key={l.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-primary">{T.palletType} {lines.length > 1 ? i + 1 : ""}</span>
                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" size="sm" variant="outline" onClick={() => update(l.id, { length: "1,2", width: "1", height: "1" })}>{T.presetStandard}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => update(l.id, { length: "1,2", width: "1", height: "1,8" })}>{T.presetTall}</Button>
                    {lines.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" aria-label={T.remove} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2 sm:col-span-1 grid gap-1">
                    <Label htmlFor={`q-${l.id}`}>{T.quantity}</Label>
                    <Input id={`q-${l.id}`} inputMode="numeric" value={l.quantity} onChange={(e) => update(l.id, { quantity: e.target.value.replace(/\D/g, "") })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`l-${l.id}`}>{T.length}</Label>
                    <Input id={`l-${l.id}`} inputMode="decimal" value={l.length} onChange={(e) => update(l.id, { length: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`w-${l.id}`}>{T.width}</Label>
                    <Input id={`w-${l.id}`} inputMode="decimal" value={l.width} onChange={(e) => update(l.id, { width: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`h-${l.id}`}>{T.height}</Label>
                    <Input id={`h-${l.id}`} inputMode="decimal" value={l.height} onChange={(e) => update(l.id, { height: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1 sm:max-w-xs">
                  <Label htmlFor={`d-${l.id}`}>{T.declared} <span className="text-xs font-normal text-muted-foreground">· {T.declaredHint}</span></Label>
                  <Input id={`d-${l.id}`} inputMode="decimal" placeholder="0" value={l.declared} onChange={(e) => update(l.id, { declared: e.target.value })} />
                </div>
                {parsed.at(i) && parsed.at(i)!.height > 0 && !fitsPosition(parsed.at(i)!) && (
                  <p className="text-sm text-amber-700 flex gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{T.consult}</p>
                )}
              </div>
            ))}
            {lines.length < 5 && (
              <Button type="button" variant="ghost" onClick={addLine} className="text-primary"><Plus className="h-4 w-4 mr-1" />{T.addLine}</Button>
            )}

            <div className="grid gap-2">
              <Label htmlFor="months">{T.term}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input id="months" className="w-24" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} />
                {TERM_CHIPS.map((n) => (
                  <Button key={n} type="button" size="sm" variant={num(months) === n ? "default" : "outline"} onClick={() => setMonths(String(n))}>
                    {T.months(n)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Resultado */}
          <div className="space-y-4">
            <div className="rounded-xl bg-gradient-section border p-5 space-y-4">
              <h4 className="font-semibold text-primary">{T.resultTitle}</h4>
              {q.consultLines.map((l, i) => (
                <div key={`c${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-text-gray">{Math.floor(l.quantity)} × {dec(l.length)}×{dec(l.width)}×{dec(l.height)} m</span>
                  <span className="text-sm font-semibold text-amber-700">{lang === "pt" ? "Sob consulta" : "A consultar"}</span>
                </div>
              ))}
              {q.lines.map((x, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-text-gray">
                    {Math.floor(x.line.quantity)} × {dec(x.line.length)}×{dec(x.line.width)}×{dec(x.line.height)} m
                  </span>
                  <span className="text-right">
                    <span className="text-2xl font-bold text-primary">{money(x.pricePerPosition, lang)}</span>
                    <span className="block text-xs text-text-gray">{T.perPosition}</span>
                  </span>
                </div>
              ))}

              <details className="text-sm text-text-gray">
                <summary className="cursor-pointer font-medium text-primary">{T.breakdown}</summary>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li>{T.bTier(money(q.tierPrice, lang), q.totalPositions)}</li>
                  {q.lines.some((x) => x.volumeFactor > 1) && <li>{T.bVolume(q.lines.map((x) => dec(x.volumeFactor)).join(" / "))}</li>}
                  {q.lines.some((x) => x.oversizeFee > 0) && <li>{T.bOversize(money(PRICING.oversizeFee, lang))}</li>}
                  {q.smallQuantityFee > 0 && <li>{T.bSmall(money(q.smallQuantityFee, lang))}</li>}
                  {q.termFee > 0 && <li>{T.bTerm(money(q.termFee, lang))}</li>}
                </ul>
              </details>

              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-text-gray">{T.rentMonthly}</span><span className="font-semibold">{money(q.rentMonthly, lang)}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">{T.insuranceMonthly}</span><span className="font-semibold">{money(q.insuranceMonthly, lang)}</span></div>
                <div className="flex justify-between text-base"><span className="font-semibold">{T.totalMonthly}</span><span className="font-bold text-primary">{money(q.totalMonthly, lang)}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">{T.totalContract(q.months)}</span><span className="font-semibold whitespace-nowrap">{money(q.totalContract, lang)}</span></div>
              </div>

              {(q.termFee > 0 || nextTier) && (
                <div className="text-xs text-text-gray space-y-1">
                  {q.termFee > 0 && <p className="flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{T.tipTerm}</p>}
                  {nextTier && <p className="flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{T.tipQty(nextTier.from, money(tierPriceFor(nextTier.from), lang))}</p>}
                </div>
              )}
            </div>

            {/* Dados para a proposta */}
            <div className="rounded-xl border p-5 space-y-3">
              <h4 className="font-semibold text-primary">{T.formTitle}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1"><Label htmlFor="p-name">{T.name} *</Label><Input id="p-name" autoComplete="name" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="p-company">{T.company} *</Label><Input id="p-company" autoComplete="organization" value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="p-email">{T.email} *</Label><Input id="p-email" type="email" autoComplete="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="p-phone">{T.phone} *</Label><Input id="p-phone" type="tel" autoComplete="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></div>
                <div className="grid gap-1 col-span-2"><Label htmlFor="p-tax">{T.taxId}</Label><Input id="p-tax" value={client.taxId} onChange={(e) => setClient({ ...client, taxId: e.target.value })} /></div>
              </div>
              <label className="flex items-start gap-2 text-sm text-text-gray cursor-pointer">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span>{T.consent}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {T.saveNote}
                {savedAt && <span className="ml-1 text-primary font-medium">· {T.saved} {savedAt}</span>}
              </p>
              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                <Button type="button" size="lg" className="bg-industrial-orange hover:bg-industrial-orange/90 text-white" disabled={!canQuote || busy} onClick={() => generate(false)}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}{busy ? T.generating : T.download}
                </Button>
                <Button type="button" size="lg" className="text-white hover:brightness-110" style={{ backgroundColor: "#25D366" }} disabled={!canQuote || busy} onClick={() => generate(true)}>
                  <MessageCircle className="h-4 w-4 mr-2" />{T.whatsapp}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

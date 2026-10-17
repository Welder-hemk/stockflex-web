import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Loader2, MessageCircle, Send, Warehouse, Layers, TrendingUp, PencilRuler, Wrench, HardHat, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { structuresText } from "@/lib/structuresText";
import { submitLead } from "@/lib/leads";
import { trackWhatsApp } from "@/lib/tracker";
import { WHATSAPP_NUMBER } from "@/components/WhatsAppFloat";

const waUrl = (text: string) => `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(text)}`;
const WHY_ICONS = [TrendingUp, Layers, PencilRuler];

function Photo({ name, alt, eager = false }: { name: "seletivo" | "drive-in"; alt: string; eager?: boolean }) {
  return (
    <img
      src={`/img/estructura-${name}-1600.webp`}
      srcSet={`/img/estructura-${name}-800.webp 800w, /img/estructura-${name}-1600.webp 1600w`}
      sizes="(max-width: 768px) 100vw, 50vw"
      alt={alt}
      width="1600"
      height="900"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="w-full h-full object-cover"
    />
  );
}

const SERVICE_ICONS = [HardHat, Wrench, ClipboardCheck];

export default function Structures() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("pt") ? "pt" : "es";
  const T = structuresText(lang);
  const { toast } = useToast();

  const [f, setF] = useState({
    modality: "", city: "", length: "", width: "", height: "", positions: "", palletWeight: "", term: "", start: "", cargo: "",
    name: "", company: "", email: "", phone: "",
  });
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const clientOk = f.name.trim().length > 1 && f.company.trim().length > 1 && /\S+@\S+\.\S+/.test(f.email) && f.phone.replace(/\D/g, "").length >= 7;
  const num = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? undefined : n;
  };

  const scrollToForm = () => document.getElementById("cotizacion")?.scrollIntoView({ behavior: "smooth", block: "start" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!clientOk) {
      toast({ title: T.required, variant: "destructive" });
      return;
    }
    setSending(true);
    const area = (num(f.length) || 0) * (num(f.width) || 0);
    const summary = [
      f.modality && `${T.modality}: ${T.modalityOptions[f.modality as keyof typeof T.modalityOptions]}`,
      f.city && `${T.city}: ${f.city}`,
      area > 0 && `${f.length} × ${f.width} m (${area.toFixed(0)} m²)${f.height ? ` · ${f.height} m` : ""}`,
      f.positions && `${T.positions}: ${f.positions}`,
      f.palletWeight && `${T.palletWeight}: ${f.palletWeight}`,
      f.term && `${T.term}: ${f.term}`,
      f.start && `${T.start} ${T.startOptions[f.start as keyof typeof T.startOptions]}`,
      f.cargo && `${T.cargo} ${f.cargo}`,
    ].filter(Boolean).join("\n");
    const ok = await submitLead(
      "structures",
      { name: f.name, company: f.company, email: f.email, phone: f.phone, palletQuantity: f.positions, message: summary, consent },
      lang,
      {
        details: {
          modality: f.modality || null,
          city: f.city || null,
          length: num(f.length) ?? null,
          width: num(f.width) ?? null,
          height: num(f.height) ?? null,
          areaM2: area || null,
          totalPositions: num(f.positions) ?? 0,
          palletWeightKg: num(f.palletWeight) ?? null,
          months: num(f.term) ?? 0,
          start: f.start || null,
          cargo: f.cargo || null,
        },
      },
    );
    setSending(false);
    if (ok) {
      setSent(true);
      toast({ title: T.sent });
    } else {
      toast({ title: T.failed });
      window.open(waUrl(`${T.waText}\n${summary}`), "_blank", "noopener");
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Topo */}
      <section id="estructuras" className="relative bg-gradient-hero text-white overflow-hidden">
        <div className="container mx-auto px-4 pt-6 pb-16">
          <div className="flex items-center justify-between mb-10">
            <Link to={`/${lang}`} aria-label={T.back}>
              <img src="/logo-stockflex-white.webp" alt="StockFlex" className="h-11 w-auto" width="152" height="44" />
            </Link>
          </div>
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <span className="inline-block rounded-full bg-industrial-orange/90 px-3 py-1 text-xs font-bold uppercase tracking-wide">{T.badge}</span>
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight">{T.title}</h1>
              <p className="text-lg text-blue-100 max-w-xl">{T.lead}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" onClick={scrollToForm} className="bg-industrial-orange hover:bg-industrial-orange/90 text-white min-h-[52px] text-base font-semibold">
                  {T.ctaQuote}
                </Button>
                <Button asChild size="lg" className="text-white min-h-[52px] text-base font-semibold hover:brightness-110" style={{ backgroundColor: "#25D366" }}>
                  <a href={waUrl(T.waText)} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsApp()}>
                    <MessageCircle className="mr-2 h-5 w-5" />
                    {T.ctaWhatsapp}
                  </a>
                </Button>
              </div>
              <p className="text-sm text-blue-200">{T.onRequest}</p>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-hero aspect-[16/9]">
              <Photo name="seletivo" alt={T.selective.imageAlt} eager />
            </div>
          </div>
        </div>
      </section>

      {/* Modalidades */}
      <section id="modalidades" className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-primary text-center mb-10">{T.modalitiesTitle}</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { m: T.selective, img: "seletivo" as const },
              { m: T.driveIn, img: "drive-in" as const },
            ].map(({ m, img }) => (
              <article key={img} className="rounded-2xl border bg-card overflow-hidden shadow-sm flex flex-col">
                <div className="aspect-[16/9]"><Photo name={img} alt={m.imageAlt} /></div>
                <div className="p-6 space-y-3 flex-1">
                  <h3 className="text-2xl font-bold text-primary">{m.name}</h3>
                  <p className="font-semibold text-industrial-orange">{m.tagline}</p>
                  <p className="text-text-gray">{m.when}</p>
                  <ul className="space-y-1.5 pt-1">
                    {m.points.map((p) => (
                      <li key={p} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />{p}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 max-w-3xl mx-auto">
            <h3 className="text-xl font-bold text-primary mb-4 text-center">{T.compareTitle}</h3>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>{T.compareHead.map((h, i) => <th key={i} className="text-left p-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {T.compareRows.map((r) => (
                    <tr key={r[0]} className="border-t">
                      <td className="p-3 font-medium">{r[0]}</td><td className="p-3">{r[1]}</td><td className="p-3">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Por que alugar + como funciona */}
      <section id="como-funciona" className="py-16 bg-gradient-section">
        <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-bold text-primary mb-6">{T.whyTitle}</h2>
            <div className="space-y-5">
              {T.why.map((w, i) => {
                const Icon = WHY_ICONS[i] || Warehouse;
                return (
                  <div key={w.t} className="flex gap-4">
                    <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
                    <div><h3 className="font-semibold">{w.t}</h3><p className="text-sm text-text-gray">{w.d}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-primary mb-6">{T.howTitle}</h2>
            <ol className="space-y-5">
              {T.how.map((h, i) => (
                <li key={h.t} className="flex gap-4">
                  <span className="h-9 w-9 rounded-full bg-industrial-orange text-white font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div><h3 className="font-semibold">{h.t}</h3><p className="text-sm text-text-gray">{h.d}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Instalação e manutenção */}
      <section id="instalacion-mantenimiento" className="py-14">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-primary mb-6">{T.serviceTitle}</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {T.service.map((sv, i) => {
              const Icon = SERVICE_ICONS[i] || Wrench;
              return (
                <div key={sv.t} className="rounded-xl border bg-white p-5 shadow-sm">
                  <Icon className="h-6 w-6 text-industrial-orange mb-3" />
                  <h3 className="font-semibold mb-1">{sv.t}</h3>
                  <p className="text-sm text-text-gray">{sv.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Formulário */}
      <section id="cotizacion" className="py-16 scroll-mt-4">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-primary text-center">{T.formTitle}</h2>
          <p className="text-center text-text-gray mt-2 mb-8">{T.formSubtitle}</p>
          {sent ? (
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 text-center space-y-4">
              <Check className="h-10 w-10 text-primary mx-auto" />
              <p className="text-lg font-semibold">{T.sent}</p>
              <Button asChild variant="outline"><Link to={`/${lang}`}><ArrowLeft className="h-4 w-4 mr-2" />{T.back}</Link></Button>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-2xl border bg-card p-6 md:p-8 space-y-5 shadow-sm">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label>{T.modality}</Label>
                  <Select value={f.modality} onValueChange={(v) => setF((s) => ({ ...s, modality: v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(T.modalityOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5"><Label htmlFor="s-city">{T.city}</Label><Input id="s-city" value={f.city} onChange={set("city")} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-1.5"><Label htmlFor="s-len">{T.length}</Label><Input id="s-len" inputMode="decimal" value={f.length} onChange={set("length")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-wid">{T.width}</Label><Input id="s-wid" inputMode="decimal" value={f.width} onChange={set("width")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-hei">{T.height}</Label><Input id="s-hei" inputMode="decimal" value={f.height} onChange={set("height")} /></div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="grid gap-1.5"><Label htmlFor="s-pos">{T.positions}</Label><Input id="s-pos" inputMode="numeric" value={f.positions} onChange={set("positions")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-kg">{T.palletWeight}</Label><Input id="s-kg" inputMode="numeric" value={f.palletWeight} onChange={set("palletWeight")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-term">{T.term}</Label><Input id="s-term" inputMode="numeric" value={f.term} onChange={set("term")} /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label>{T.start}</Label>
                  <Select value={f.start} onValueChange={(v) => setF((s) => ({ ...s, start: v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(T.startOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5"><Label htmlFor="s-cargo">{T.cargo}</Label><Textarea id="s-cargo" className="min-h-[40px]" value={f.cargo} onChange={set("cargo")} /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 border-t pt-5">
                <div className="grid gap-1.5"><Label htmlFor="s-name">{T.name} *</Label><Input id="s-name" autoComplete="name" value={f.name} onChange={set("name")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-company">{T.company} *</Label><Input id="s-company" autoComplete="organization" value={f.company} onChange={set("company")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-email">{T.email} *</Label><Input id="s-email" type="email" autoComplete="email" value={f.email} onChange={set("email")} /></div>
                <div className="grid gap-1.5"><Label htmlFor="s-phone">{T.phone} *</Label><Input id="s-phone" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
              </div>
              <label className="flex items-start gap-2 text-sm text-text-gray cursor-pointer">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span>{T.consent}</span>
              </label>
              <Button type="submit" size="lg" disabled={sending} className="w-full bg-industrial-orange hover:bg-industrial-orange/90 text-white min-h-[52px] text-base font-semibold">
                {sending ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Send className="h-5 w-5 mr-2" />}
                {sending ? T.sending : T.send}
              </Button>
            </form>
          )}
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-text-gray border-t">
        <Link to={`/${lang}`} className="underline">{T.back}</Link> · StockFlex · stockflex.com.py
      </footer>
    </main>
  );
}

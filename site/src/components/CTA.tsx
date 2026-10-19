import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageCircle, MapPin, Send, LogIn, ShieldCheck, Briefcase, Wrench, Crown, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getWhatsAppLink } from "@/components/WhatsAppFloat";
import { PORTAL_URL } from "@/components/PortalAccess";
import { submitLead } from "@/lib/leads";

const CTA = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language?.split("-")[0] || "pt");
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", company: "", email: "", phone: "", palletQuantity: "", message: "" });
  const [contactData, setContactData] = useState({ name: "", company: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);
  const [consent, setConsent] = useState(false);
  // Campo invisível: pessoas não preenchem, robôs de spam sim
  const [honeypot, setHoneypot] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };
  const handleContactInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContactData((p) => ({ ...p, [name]: value }));
  };

  const openMailFallback = (subject: string, body: string) => {
    window.location.href = `mailto:contacto@stockflex.com.py?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (honeypot) { setIsOpen(false); return; }
    setSending(true);
    const ok = await submitLead("quote", { ...formData, consent }, lang);
    setSending(false);
    if (ok) {
      toast({ title: t("cta.sentTitle") as string, description: t("cta.sentDesc") as string });
    } else {
      openMailFallback(t("cta.emailSubject") as string, t("cta.emailBody", { ...formData }) as string);
      toast({ title: t("cta.fallbackTitle") as string, description: t("cta.fallbackDesc") as string });
    }
    setIsOpen(false);
    setFormData({ name: "", company: "", email: "", phone: "", palletQuantity: "", message: "" });
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (honeypot) { setIsContactOpen(false); return; }
    setSending(true);
    const ok = await submitLead("contact", { ...contactData, consent }, lang);
    setSending(false);
    if (ok) {
      toast({ title: t("cta.sentTitle") as string, description: t("cta.sentDescContact") as string });
    } else {
      openMailFallback(t("cta.emailSubjectContact") as string, t("cta.emailBodyContact", { ...contactData }) as string);
      toast({ title: t("cta.fallbackTitle") as string, description: t("cta.fallbackDesc") as string });
    }
    setIsContactOpen(false);
    setContactData({ name: "", company: "", email: "", phone: "", message: "" });
  };

  const honeypotField = (
    <input
      type="text"
      name="website"
      value={honeypot}
      onChange={(e) => setHoneypot(e.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="absolute left-[-9999px] w-px h-px opacity-0"
    />
  );

  return (
    <section id="contato" className="py-20 bg-gradient-hero">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-4">{t("cta.title")}</h2>
          <p className="text-xl mb-8 text-blue-100">{t("cta.subtitle")}</p>

          <div className="mb-12 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-2xl mx-auto">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-industrial-orange hover:bg-industrial-orange/90 text-white w-full sm:w-auto min-h-[56px] px-6 sm:px-10 py-4 sm:py-6 text-base sm:text-xl font-semibold shadow-hero">
                  {t("cta.mainButton")}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-primary text-center">{t("cta.quoteDialogTitle")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 relative">
                  {honeypotField}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">{t("cta.form.name")} *</Label>
                      <Input id="name" name="name" value={formData.name} onChange={handleInputChange} required placeholder={t("cta.form.namePlaceholder") as string} />
                    </div>
                    <div>
                      <Label htmlFor="company">{t("cta.form.company")} *</Label>
                      <Input id="company" name="company" value={formData.company} onChange={handleInputChange} required placeholder={t("cta.form.companyPlaceholder") as string} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">{t("cta.form.email")} *</Label>
                      <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} required placeholder={t("cta.form.emailPlaceholder") as string} />
                    </div>
                    <div>
                      <Label htmlFor="phone">{t("cta.form.phone")}</Label>
                      <Input id="phone" name="phone" value={formData.phone} onChange={handleInputChange} placeholder={t("cta.form.phonePlaceholder") as string} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="palletQuantity">{t("cta.form.palletQuantity")}</Label>
                    <Input id="palletQuantity" name="palletQuantity" value={formData.palletQuantity} onChange={handleInputChange} placeholder={t("cta.form.palletQuantityPlaceholder") as string} />
                  </div>
                  <div>
                    <Label htmlFor="message">{t("cta.form.message")}</Label>
                    <Textarea id="message" name="message" value={formData.message} onChange={handleInputChange} placeholder={t("cta.form.messagePlaceholder") as string} className="min-h-[100px]" />
                  </div>
                  <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                    <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                    <span>{lang === "pt" ? "Aceito receber novidades e ofertas da StockFlex por e-mail ou WhatsApp." : "Acepto recibir novedades y ofertas de StockFlex por correo o WhatsApp."}</span>
                  </label>
                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="flex-1">{t("cta.form.cancel")}</Button>
                    <Button type="submit" disabled={sending} className="flex-1 bg-industrial-orange hover:bg-industrial-orange/90">
                      {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      {sending ? t("cta.form.sending") : t("cta.form.send")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <Button
              asChild
              size="lg"
              className="text-white w-full sm:w-auto min-h-[56px] px-6 sm:px-10 py-4 sm:py-6 text-base sm:text-xl font-semibold shadow-hero hover:brightness-110"
              style={{ backgroundColor: "#25D366" }}
            >
              <a href={getWhatsAppLink(lang)} target="_blank" rel="noopener noreferrer" aria-label={t("hero.ctaWhatsapp") as string}>
                <MessageCircle className="mr-2 w-5 h-5" />
                {t("hero.ctaWhatsapp")}
              </a>
            </Button>
          </div>

          {/* Highlight: Acesso ao Sistema de Gestão (diferencial) */}
          <div className="mb-12">
            {/* selo fora do cartão: com overflow-hidden ele ficava cortado */}
            <div className="relative pt-3">
            <div className="absolute top-0 left-6 z-10 bg-industrial-orange text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-md">
              {lang === "pt" ? "Diferencial Exclusivo" : "Diferencial Exclusivo"}
            </div>
            <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl border-4 border-industrial-orange/80">
              <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center p-6 md:p-8">
                <div className="text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-hero text-white shadow-md">
                      <LogIn className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-bold text-primary leading-tight">
                        {lang === "pt" ? "Sistema de Gestão de Estoque" : "Sistema de Gestión de Stock"}
                      </h3>
                      <p className="text-sm text-text-gray">
                        {lang === "pt"
                          ? "Acompanhe movimentações, pallets e relatórios em tempo real."
                          : "Monitoree movimientos, pallets e informes en tiempo real."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {[
                      { icon: Briefcase, label: lang === "pt" ? "Cliente" : "Cliente" },
                      { icon: ShieldCheck, label: lang === "pt" ? "Autorizado" : "Autorizado" },
                      { icon: Wrench, label: lang === "pt" ? "Operador" : "Operador" },
                      { icon: Crown, label: lang === "pt" ? "Administrador" : "Administrador" },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <a
                  href={PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center justify-center gap-2 w-full md:w-auto min-h-[56px] px-8 py-4 text-base md:text-lg font-bold rounded-xl bg-industrial-orange hover:bg-industrial-orange/90 text-white shadow-hero transition-all hover:scale-105"
                >
                  <LogIn className="w-5 h-5" />
                  {lang === "pt" ? "Acessar Sistema" : "Acceder al Sistema"}
                  <ExternalLink className="w-4 h-4 opacity-80 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-white border-white/20 shadow-lg">
              <CardContent className="p-6 text-center">
                <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
                  <DialogTrigger asChild>
                    <button className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-industrial-orange hover:bg-industrial-orange/90 mb-4 transition-colors cursor-pointer">
                      <Mail className="w-6 h-6 text-white" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-bold text-primary text-center">{t("cta.contactDialogTitle")}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleContactSubmit} className="space-y-4 relative">
                      {honeypotField}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="contact-name">{t("cta.form.name")} *</Label>
                          <Input id="contact-name" name="name" value={contactData.name} onChange={handleContactInputChange} required placeholder={t("cta.form.namePlaceholder") as string} />
                        </div>
                        <div>
                          <Label htmlFor="contact-company">{t("cta.form.company")}</Label>
                          <Input id="contact-company" name="company" value={contactData.company} onChange={handleContactInputChange} placeholder={t("cta.form.companyPlaceholder") as string} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="contact-email">{t("cta.form.email")} *</Label>
                          <Input id="contact-email" name="email" type="email" value={contactData.email} onChange={handleContactInputChange} required placeholder={t("cta.form.emailPlaceholder") as string} />
                        </div>
                        <div>
                          <Label htmlFor="contact-phone">{t("cta.form.phone")}</Label>
                          <Input id="contact-phone" name="phone" value={contactData.phone} onChange={handleContactInputChange} placeholder={t("cta.form.phonePlaceholder") as string} />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="contact-message">{t("cta.form.contactMessage")} *</Label>
                        <Textarea id="contact-message" name="message" value={contactData.message} onChange={handleContactInputChange} required placeholder={t("cta.form.contactMessagePlaceholder") as string} className="min-h-[100px]" />
                      </div>
                      <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                        <span>{lang === "pt" ? "Aceito receber novidades e ofertas da StockFlex por e-mail ou WhatsApp." : "Acepto recibir novedades y ofertas de StockFlex por correo o WhatsApp."}</span>
                      </label>
                      <div className="flex gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsContactOpen(false)} className="flex-1">{t("cta.form.cancel")}</Button>
                        <Button type="submit" disabled={sending} className="flex-1 bg-industrial-orange hover:bg-industrial-orange/90">
                          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                          {sending ? t("cta.form.sending") : t("cta.form.sendContact")}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                <h3 className="font-semibold mb-2 text-gray-900">{t("cta.emailLabel")}</h3>
                <p className="text-gray-700">contacto@stockflex.com.py</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-white/20 shadow-lg">
              <CardContent className="p-6 text-center">
                <a href={getWhatsAppLink(lang)} target="_blank" rel="noopener noreferrer" aria-label={t("cta.whatsappLabel") as string} className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-industrial-orange hover:bg-industrial-orange/90 mb-4 transition-colors cursor-pointer">
                  <MessageCircle className="w-6 h-6 text-white" />
                </a>
                <h3 className="font-semibold mb-2 text-gray-900">{t("cta.whatsappLabel")}</h3>
                <p className="text-gray-700">{t("cta.whatsappText")}</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-white/20 shadow-lg">
              <CardContent className="p-6 text-center">
                <a href="https://maps.app.goo.gl/czqBWoF37t6uh56i8" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-industrial-orange hover:bg-industrial-orange/90 mb-4 transition-colors cursor-pointer">
                  <MapPin className="w-6 h-6 text-white" />
                </a>
                <h3 className="font-semibold mb-2 text-gray-900">{t("cta.locationLabel")}</h3>
                <p className="text-gray-700">{t("cta.locationText")}</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 p-6 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            <h3 className="text-lg font-semibold mb-2">{t("cta.footerTitle")}</h3>
            <p className="text-blue-100">{t("cta.footerText")}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;

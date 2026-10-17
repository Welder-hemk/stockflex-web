import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Clock, MapPin, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getWhatsAppLink } from "@/components/WhatsAppFloat";

const Hero = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language?.split("-")[0] || "pt");
  const scrollToContact = () => {
    document.getElementById("contato")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section id="inicio" className="relative min-h-screen flex items-center bg-gradient-hero overflow-hidden">
      <div className="absolute inset-0 bg-black/20"></div>

      <div className="container mx-auto px-4 pt-20 pb-24 sm:py-20 relative z-10">
        <div className="text-center mb-12 animate-fade-in">
          <img
            src="/logo-stockflex-white.webp"
            alt={t("hero.logoAlt") as string}
            className="h-16 md:h-20 w-auto mx-auto"
            width="276"
            height="80"
            loading="eager"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-white space-y-8 animate-slide-up">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                {t("hero.title1")} <span className="text-industrial-orange">{t("hero.titleHighlight")}</span>
              </h1>
              <h2 className="text-2xl lg:text-3xl font-light text-blue-100">{t("hero.subtitle")}</h2>
              <p className="text-xl text-blue-200 max-w-lg">{t("hero.description")}</p>
              <div className="flex items-center gap-2 text-blue-100">
                <MapPin className="w-5 h-5 text-industrial-orange" />
                <span className="text-base font-medium">{t("hero.location")}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <Shield className="w-5 h-5 text-industrial-orange" />
                <span className="text-sm font-medium">{t("hero.badge1")}</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <Clock className="w-5 h-5 text-industrial-orange" />
                <span className="text-sm font-medium">{t("hero.badge2")}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
              <Button
                size="lg"
                onClick={scrollToContact}
                className="bg-industrial-orange hover:bg-industrial-orange/90 text-white w-full sm:w-auto min-h-[52px] px-6 sm:px-8 py-4 text-base sm:text-lg font-semibold shadow-hero"
              >
                {t("hero.ctaQuote")}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                asChild
                size="lg"
                className="text-white w-full sm:w-auto min-h-[52px] px-6 sm:px-8 py-4 text-base sm:text-lg font-semibold shadow-hero hover:brightness-110"
                style={{ backgroundColor: "#25D366" }}
              >
                <a href={getWhatsAppLink(lang)} target="_blank" rel="noopener noreferrer" aria-label={t("hero.ctaWhatsapp") as string}>
                  <MessageCircle className="mr-2 w-5 h-5" />
                  {t("hero.ctaWhatsapp")}
                </a>
              </Button>
            </div>
          </div>

          <div className="relative animate-fade-in">
            <div className="relative rounded-2xl overflow-hidden shadow-hero">
              <img
                src="/img/estructura-seletivo-1600.webp"
                srcSet="/img/estructura-seletivo-800.webp 800w, /img/estructura-seletivo-1600.webp 1600w"
                sizes="(max-width: 1024px) 100vw, 628px"
                alt={t("hero.imageAlt") as string}
                className="w-full h-[600px] object-cover"
                width="1067"
                height="600"
                fetchPriority="high"
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
            </div>

            <div className="absolute -bottom-6 left-4 bg-white rounded-xl p-6 shadow-card animate-float">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{t("hero.stats1Number")}</div>
                <div className="text-sm text-text-gray">{t("hero.stats1Label")}</div>
              </div>
            </div>

            <div
              className="absolute -top-6 right-4 bg-industrial-orange rounded-xl p-6 shadow-card text-white animate-float"
              style={{ animationDelay: "1s" }}
            >
              <div className="text-center">
                <div className="text-3xl font-bold">24/7</div>
                <div className="text-sm opacity-90">{t("hero.stats2Label")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

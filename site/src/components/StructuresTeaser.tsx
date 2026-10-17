import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { structuresText } from "@/lib/structuresText";
import { pagePath } from "@/lib/routes";

// Chamada na página inicial para o serviço de aluguel de estruturas
const StructuresTeaser = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("pt") ? "pt" : "es";
  const T = structuresText(lang);
  return (
    <section id="alquiler-estructuras" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 items-stretch rounded-2xl border bg-card overflow-hidden shadow-sm">
          <div className="relative aspect-[16/9] lg:aspect-auto lg:min-h-[340px] overflow-hidden">
            <img
              src="/img/estructura-drive-in-800.webp"
              srcSet="/img/estructura-drive-in-800.webp 800w, /img/estructura-drive-in-1600.webp 1600w"
              sizes="(max-width: 1024px) 100vw, 50vw"
              alt={T.driveIn.imageAlt}
              width="1600"
              height="900"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div className="p-6 lg:p-10 space-y-4 self-center">
            <span className="inline-block rounded-full bg-industrial-orange/10 text-industrial-orange px-3 py-1 text-xs font-bold uppercase tracking-wide">{T.badge}</span>
            <h2 className="text-3xl font-bold text-primary">{T.teaserTitle}</h2>
            <p className="text-text-gray text-lg">{T.teaserText}</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-secondary px-3 py-1">{T.selective.name}</span>
              <span className="rounded-full bg-secondary px-3 py-1">{T.driveIn.name}</span>
            </div>
            <Link
              to={pagePath("structures", lang)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {T.teaserCta} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StructuresTeaser;

import { Card, CardContent } from "@/components/ui/card";
import { Maximize2, TrendingDown, ShieldCheck, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

const CompetitiveAdvantages = () => {
  const { t } = useTranslation();
  const items = t("competitiveAdvantages.items", { returnObjects: true }) as Array<{ title: string; description: string }>;
  const icons = [Maximize2, TrendingDown, ShieldCheck, Zap];

  return (
    <section id="ventajas" className="py-20 bg-warehouse-gray">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-primary mb-4">{t("competitiveAdvantages.title")}</h2>
          <p className="text-xl text-text-gray max-w-4xl mx-auto">{t("competitiveAdvantages.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {items.map((advantage, index) => {
            const Icon = icons[index];
            return (
              <Card key={index} className="group hover:shadow-card transition-all duration-300 hover:-translate-y-2 border-0 shadow-md bg-white">
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-primary mb-4">{advantage.title}</h3>
                  <p className="text-text-gray text-sm leading-relaxed">{advantage.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CompetitiveAdvantages;

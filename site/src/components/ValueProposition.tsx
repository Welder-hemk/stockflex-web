import { Card, CardContent } from "@/components/ui/card";
import { Shield, Camera, Truck, Eye, Lock, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

const ValueProposition = () => {
  const { t } = useTranslation();
  const items = t("valueProposition.items", { returnObjects: true }) as Array<{ title: string; description: string }>;
  const icons = [Shield, ClipboardCheck, Truck, Camera, Lock, Eye];
  // Items 3, 4, 5 (Monitoramento Remoto, Controle de Acesso, Check-in/out) get "coming soon"
  const comingSoonIdx = new Set([3, 5]);

  return (
    <section id="propuesta" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-primary mb-4">{t("valueProposition.title")}</h2>
          <p className="text-xl text-text-gray max-w-4xl mx-auto">{t("valueProposition.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((feature, index) => {
            const Icon = icons[index];
            const showBadge = comingSoonIdx.has(index);
            return (
              <Card
                key={index}
                className="relative overflow-hidden group hover:shadow-card transition-all duration-300 border-0 shadow-md"
              >
                {showBadge && (
                  <div className="absolute top-3 -right-10 rotate-45 bg-red-600 text-white text-xs font-bold py-1 w-40 text-center shadow-md z-10">
                    {t("valueProposition.comingSoon")}
                  </div>
                )}
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-primary mb-2">{feature.title}</h3>
                      <p className="text-text-gray text-sm leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ValueProposition;

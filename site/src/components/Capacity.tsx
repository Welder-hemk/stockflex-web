import { Card, CardContent } from "@/components/ui/card";
import { Building2, BarChart3, Shield, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

const Capacity = () => {
  const { t } = useTranslation();
  const items = t("capacity.items", { returnObjects: true }) as Array<{ title: string; description: string }>;
  const icons = [Building2, BarChart3, Shield, Settings];

  return (
    <section id="capacidad" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-primary mb-4">{t("capacity.title")}</h2>
          <p className="text-xl text-text-gray max-w-4xl mx-auto">{t("capacity.subtitle")}</p>
        </div>

        <div className="mb-16">
          <div className="rounded-2xl flex items-center justify-center p-8 bg-industrial-blue">
            <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center justify-center gap-6 mb-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">960</div>
                  <div className="text-sm text-text-gray">{t("capacity.stat1")}</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">24/7</div>
                  <div className="text-sm text-text-gray">{t("capacity.stat2")}</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">100%</div>
                  <div className="text-sm text-text-gray">{t("capacity.stat3")}</div>
                </div>
              </div>
              <p className="text-sm text-text-gray font-medium">{t("capacity.tagline")}</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {items.map((feature, index) => {
            const Icon = icons[index];
            return (
              <Card key={index} className="group hover:shadow-card transition-all duration-300 hover:-translate-y-2 border-0 shadow-md bg-white">
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-primary mb-4">{feature.title}</h3>
                  <p className="text-text-gray text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Capacity;

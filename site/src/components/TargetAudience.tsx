import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Warehouse, PiggyBank } from "lucide-react";
import { useTranslation } from "react-i18next";

const TargetAudience = () => {
  const { t } = useTranslation();
  const items = t("targetAudience.items", { returnObjects: true }) as Array<{ title: string; description: string }>;
  const icons = [TrendingUp, Warehouse, PiggyBank];
  const colors = ["text-primary", "text-industrial-orange", "text-primary"];

  return (
    <section id="publico" className="py-20 bg-gradient-section">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-primary mb-4">{t("targetAudience.title")}</h2>
          <p className="text-xl text-text-gray max-w-3xl mx-auto">{t("targetAudience.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {items.map((audience, index) => {
            const Icon = icons[index];
            return (
              <Card key={index} className="group hover:shadow-card transition-all duration-300 hover:-translate-y-2 border-0 shadow-lg">
                <CardContent className="p-8 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary/10 to-industrial-orange/10 mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className={`w-8 h-8 ${colors[index]}`} />
                  </div>
                  <h3 className="text-xl font-bold text-primary mb-4">{audience.title}</h3>
                  <p className="text-text-gray leading-relaxed">{audience.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TargetAudience;

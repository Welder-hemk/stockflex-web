import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, DollarSign, Calendar, Package, Truck } from "lucide-react";
import ProposalSimulator from "@/components/ProposalSimulator";
import { useTranslation } from "react-i18next";

const Pricing = () => {
  const { t } = useTranslation();
  const conditions = t("pricing.conditions", { returnObjects: true }) as Array<{ label: string; value: string }>;
  const condIcons = [Calendar, Package, Truck, DollarSign];
  const included = t("pricing.included", { returnObjects: true }) as string[];
  const specs = t("pricing.specs", { returnObjects: true }) as string[];

  const tiers = [
    { price: "U$ 8,00", range: t("pricing.tier1Range") as string },
    { price: "U$ 7,50", range: t("pricing.tier2Range") as string },
    { price: "U$ 7,00", range: t("pricing.tier3Range") as string },
  ];

  const scrollToSimulator = () =>
    document.getElementById("simulador")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <section id="precios" className="py-20 bg-gradient-section">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-primary mb-4">{t("pricing.title")}</h2>
          <p className="text-xl text-text-gray max-w-4xl mx-auto">{t("pricing.subtitle")}</p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid gap-8 mb-12">
            <Card className="border-2 border-primary shadow-hero">
              <CardHeader className="text-center bg-primary text-primary-foreground">
                <CardTitle className="text-3xl font-bold">{t("pricing.planTitle")}</CardTitle>
                <p className="text-lg opacity-90">{t("pricing.planSubtitle")}</p>
              </CardHeader>
              <CardContent className="p-8">
                <div className="mb-8">
                  <div className="grid md:grid-cols-3 gap-6 mb-4">
                    {tiers.map((tier, i) => (
                      <div key={i} className="text-center p-6 rounded-lg bg-gradient-section border border-primary/10">
                        <div className="text-4xl font-bold text-primary mb-2">{tier.price}</div>
                        <div className="text-sm text-text-gray mb-3">{t("pricing.perPosition")}</div>
                        <div className="text-sm font-medium text-primary">{tier.range}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-text-gray text-center mt-4 italic">{t("pricing.negotiable")}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-primary">{t("pricing.includedTitle")}</h4>
                    <ul className="space-y-2">
                      {included.map((item, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-sm text-text-gray">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold text-primary">{t("pricing.specsTitle")}</h4>
                    <ul className="space-y-2">
                      {specs.map((item, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-industrial-orange flex-shrink-0" />
                          <span className="text-sm text-text-gray">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="text-center">
                  <Button size="lg" onClick={scrollToSimulator} className="bg-primary hover:bg-primary/90 px-8 py-4">
                    {t("pricing.ctaPersonalized")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ProposalSimulator />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {conditions.map((condition, index) => {
              const Icon = condIcons[index];
              return (
                <Card key={index} className="border-0 shadow-md">
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h4 className="font-semibold text-primary mb-2">{condition.label}</h4>
                    <p className="text-sm text-text-gray leading-relaxed">{condition.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <p className="text-lg text-text-gray">{t("pricing.footer")}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Pricing;

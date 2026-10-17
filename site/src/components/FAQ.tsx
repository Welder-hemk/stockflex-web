import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTranslation } from "react-i18next";

const FAQ = () => {
  const { t } = useTranslation();
  const faqs = t("faq.items", { returnObjects: true }) as Array<{ question: string; answer: string }>;

  return (
    <section id="faq" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-primary mb-4">{t("faq.title")}</h2>
          <p className="text-xl text-text-gray max-w-3xl mx-auto">{t("faq.subtitle")}</p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border rounded-lg px-6 shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                <AccordionTrigger className="text-left hover:no-underline">
                  <span className="text-lg font-semibold text-primary pr-4">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-text-gray pt-2 pb-4 leading-relaxed">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQ;

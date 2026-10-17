import { useTranslation } from "react-i18next";

// E.164 international format without "+" or spaces, as required by wa.me
// Paraguay country code (595) + mobile number
const RAW_WHATSAPP_NUMBER = "595983110207";

// Validate: digits only, 10–15 chars per E.164
const isValidWhatsAppNumber = (n: string) => /^\d{10,15}$/.test(n);

export const WHATSAPP_NUMBER = isValidWhatsAppNumber(RAW_WHATSAPP_NUMBER)
  ? RAW_WHATSAPP_NUMBER
  : (() => {
      // Fail loudly in dev so a typo is never silently shipped
      console.error(
        `[WhatsApp] Invalid number "${RAW_WHATSAPP_NUMBER}". Must be digits only in E.164 (e.g. 595983110207).`
      );
      return RAW_WHATSAPP_NUMBER.replace(/\D/g, "");
    })();

const MESSAGES: Record<string, string> = {
  pt: "Olá! Vim pelo site StockFlex e gostaria de saber mais sobre o aluguel de posições pallet.",
  es: "¡Hola! Vine desde el sitio StockFlex y me gustaría recibir más información sobre el alquiler de posiciones pallet.",
};

export const getWhatsAppLink = (lang?: string) => {
  const normalized = (lang || "pt").toLowerCase().split("-")[0];
  const message = MESSAGES[normalized] ?? MESSAGES.pt;
  // Use api.whatsapp.com/send for highest cross-device reliability (desktop + mobile)
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
};

export const getWhatsAppLabel = (lang?: string) => {
  const normalized = (lang || "pt").toLowerCase().split("-")[0];
  return normalized === "es" ? "Hablar por WhatsApp" : "Falar pelo WhatsApp";
};

const WhatsAppFloat = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] || "pt";

  return (
    <a
      href={getWhatsAppLink(lang)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={getWhatsAppLabel(lang)}
      title={getWhatsAppLabel(lang)}
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-4 sm:right-5 z-50 flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-2xl transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#25D366]/40"
      style={{ backgroundColor: "#25D366" }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        className="w-7 h-7 sm:w-8 sm:h-8 text-white"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.478-1.318.13-.33.244-.73.244-1.103 0-.317-1.46-.96-1.69-1.06zm-2.04 7.135c-1.547 0-3.04-.45-4.32-1.297l-3.02.97 1-2.92a7.797 7.797 0 0 1-1.49-4.59c0-4.31 3.52-7.83 7.83-7.83 4.31 0 7.83 3.52 7.83 7.83 0 4.31-3.514 7.838-7.83 7.838zm0-17.237c-5.184 0-9.4 4.215-9.4 9.4 0 1.65.43 3.27 1.26 4.69L7 27l5.92-1.91a9.39 9.39 0 0 0 4.155.97c5.18 0 9.4-4.215 9.4-9.4s-4.22-9.4-9.4-9.4z" />
      </svg>
    </a>
  );
};

export default WhatsAppFloat;

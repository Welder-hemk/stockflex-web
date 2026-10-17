import { trackEvent } from "@/lib/analytics";
import { getEngagement } from "@/lib/tracker";

export type LeadKind = "contact" | "quote" | "simulation" | "proposal" | "structures";

export interface LeadInput {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  taxId?: string;
  palletQuantity?: string;
  message?: string;
  /** Aceitou receber comunicações comerciais */
  consent?: boolean;
}

const clip = (v: string | undefined, max: number) => (v ?? "").trim().slice(0, max);

/**
 * Grava o contato na base de marketing (função capture_lead do banco do app).
 * Só é chamada depois que a pessoa preencheu os dados básicos.
 * Junta o resumo do que ela fez no site, usado na pontuação do contato.
 * Retorna true se salvou; false se falhou (o chamador decide o plano B).
 */
export async function submitLead(
  kind: LeadKind,
  data: LeadInput,
  lang: string,
  extra?: { proposalNumber?: string; details?: Record<string, unknown> },
): Promise<boolean> {
  try {
    // Carregado só no envio, para não pesar no carregamento inicial do site
    const { supabase } = await import("@/integrations/supabase/client");
    const eng = getEngagement();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)("capture_lead", {
      p: {
        kind,
        name: clip(data.name, 120),
        company: clip(data.company, 160),
        email: clip(data.email, 200),
        phone: clip(data.phone, 40),
        taxId: clip(data.taxId, 40),
        palletQuantity: clip(data.palletQuantity, 40),
        message: clip(data.message, 4000),
        consent: !!data.consent,
        lang: lang === "pt" ? "pt" : "es",
        page: window.location.pathname.slice(0, 300),
        visitorId: eng?.visitorId,
        proposalNumber: extra?.proposalNumber,
        details: extra?.details,
        engagement: eng ?? undefined,
      },
    });
    if (error) {
      console.error("[leads] Falha ao gravar contato:", error.message);
      return false;
    }
    if (kind !== "simulation") trackEvent("generate_lead", { lead_type: kind });
    return true;
  } catch (err) {
    console.error("[leads] Erro inesperado:", err);
    return false;
  }
}

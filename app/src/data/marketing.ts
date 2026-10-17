// Base de contatos de marketing (prospectos que vieram do site)
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type ProspectStatus = "novo" | "contatado" | "negociacao" | "cliente" | "perdido" | "descartado";

export interface Prospect {
  id: string;
  email: string;
  name: string;
  company: string;
  phone: string;
  tax_id: string;
  lang: "es" | "pt" | null;
  consent_marketing: boolean;
  first_source: string;
  last_source: string;
  score: number;
  status: ProspectStatus;
  interests: string[];
  lead_count: number;
  max_positions: number;
  last_kind: string | null;
  last_proposal_number: string | null;
  last_total_monthly: number | null;
  notes: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ProspectLead {
  id: string;
  created_at: string;
  updated_at: string;
  kind: "contact" | "quote" | "simulation" | "proposal" | "structures";
  message: string;
  proposal_number: string | null;
  details: Record<string, unknown> | null;
  engagement: Record<string, unknown> | null;
  score: number;
  page: string | null;
}

export interface ProspectActivity {
  id: string;
  created_at: string;
  user_id: string | null;
  kind: "nota" | "ligacao" | "whatsapp" | "email" | "visita" | "status";
  text: string;
}

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  novo: "Nuevo",
  contatado: "Contactado",
  negociacao: "En negociación",
  cliente: "Cliente",
  perdido: "Perdido",
  descartado: "Descartado",
};

export const KIND_LABEL: Record<ProspectLead["kind"], string> = {
  contact: "Contacto",
  quote: "Cotización",
  simulation: "Simulación",
  proposal: "Propuesta PDF",
  structures: "Estructuras",
};

export const ACTIVITY_LABEL: Record<ProspectActivity["kind"], string> = {
  nota: "Nota",
  ligacao: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  status: "Estado",
};

/** Temperatura pelo score: quente ≥ 60, morno ≥ 30, frio abaixo */
export function temperature(score: number): { label: string; className: string } {
  if (score >= 60) return { label: "Caliente", className: "bg-destructive/10 text-destructive border-destructive/30" };
  if (score >= 30) return { label: "Tibio", className: "bg-warning/10 text-warning border-warning/30" };
  return { label: "Frío", className: "bg-info/10 text-info border-info/30" };
}

export async function fetchProspects(): Promise<Prospect[]> {
  const { data, error } = await db.from("marketing_contacts").select("*").order("last_seen_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data || []).map((r: Prospect) => ({ ...r, last_total_monthly: r.last_total_monthly == null ? null : Number(r.last_total_monthly) }));
}

export async function fetchProspectHistory(contactId: string): Promise<{ leads: ProspectLead[]; activities: ProspectActivity[] }> {
  const [l, a] = await Promise.all([
    db.from("marketing_leads").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(100),
    db.from("marketing_activities").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(200),
  ]);
  if (l.error) throw new Error(l.error.message);
  if (a.error) throw new Error(a.error.message);
  return { leads: l.data || [], activities: a.data || [] };
}

export async function updateProspect(id: string, patch: Partial<Pick<Prospect, "status" | "notes">>) {
  const { error } = await db.from("marketing_contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addActivity(contactId: string, userId: string, kind: ProspectActivity["kind"], text: string) {
  const { error } = await db.from("marketing_activities").insert({ contact_id: contactId, user_id: userId, kind, text: text.slice(0, 4000) });
  if (error) throw new Error(error.message);
}

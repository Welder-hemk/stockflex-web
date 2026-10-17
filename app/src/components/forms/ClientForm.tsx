import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useStockData } from "@/contexts/StockDataContext";
import { dbInsertClient, dbUpdateClient } from "@/data/dbMutations";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchAgents } from "@/data/commissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Client } from "@/data/types";

const schema = z.object({
  razaoSocial: z.string().trim().min(3, "Mínimo 3 caracteres").max(200, "Máximo 200 caracteres"),
  nomeFantasia: z.string().trim().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  rucCnpj: z.string().trim().min(5, "Documento inválido").max(20, "Documento inválido"),
  contato: z.string().trim().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  email: z.string().trim().email("Correo inválido").max(255, "Máximo 255 caracteres"),
  // (correo de facturación: a donde se envían las facturas)
  telefone: z.string().trim().min(8, "Teléfono inválido").max(20, "Máximo 20 caracteres"),
  endereco: z.string().trim().min(5, "Mínimo 5 caracteres").max(300, "Máximo 300 caracteres"),
  categoriaMercadoria: z.string().trim().min(1, "Campo obligatorio").max(100, "Máximo 100 caracteres"),
  observacoes: z.string().max(500, "Máximo 500 caracteres").optional(),
  agenteId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editClient?: Client;
}

const normRuc = (v: string) => v.replace(/[\s.]/g, "").toUpperCase();

export default function ClientForm({ open, onOpenChange, editClient }: Props) {
  const { clients, refresh } = useStockData();
  // solo gestión (admin/finanzas) puede leer agentes; para otros perfiles el campo no aparece
  const { user } = useAuth();
  const canAgents = user?.role === "admin" || user?.role === "financeiro";
  const agentsQ = useQuery({ queryKey: ["agents"], queryFn: fetchAgents, retry: false, enabled: open && canAgents });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      razaoSocial: "", nomeFantasia: "", rucCnpj: "", contato: "",
      email: "", telefone: "", endereco: "", categoriaMercadoria: "", observacoes: "", agenteId: "none",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(editClient ? {
      razaoSocial: editClient.razaoSocial, nomeFantasia: editClient.nomeFantasia, rucCnpj: editClient.rucCnpj, contato: editClient.contato,
      email: editClient.email, telefone: editClient.telefone, endereco: editClient.endereco, categoriaMercadoria: editClient.categoriaMercadoria,
      observacoes: editClient.observacoes || "", agenteId: editClient.agenteId || "none",
    } : { razaoSocial: "", nomeFantasia: "", rucCnpj: "", contato: "", email: "", telefone: "", endereco: "", categoriaMercadoria: "", observacoes: "", agenteId: "none" });
  }, [open, editClient, form]);

  async function onSubmit(data: FormValues) {
    const dup = clients.find((c) => c.id !== editClient?.id && normRuc(c.rucCnpj || "") === normRuc(data.rucCnpj));
    if (dup) { form.setError("rucCnpj", { message: `Ya registrado: ${dup.nomeFantasia || dup.razaoSocial}` }); return; }
    try {
      if (editClient) {
        const { agenteId, ...rest } = data;
        await dbUpdateClient(editClient.id, { ...rest, observacoes: data.observacoes || "", ...(canAgents && agentsQ.isSuccess ? { agenteId: agenteId === "none" ? "" : agenteId } : {}) });
        await refresh();
        toast.success("Cliente actualizado", { description: data.nomeFantasia });
        onOpenChange(false);
        return;
      }
      await dbInsertClient({
        codigo: "", // el banco asigna CLI-0001, CLI-0002…
        razaoSocial: data.razaoSocial,
        nomeFantasia: data.nomeFantasia,
        rucCnpj: data.rucCnpj,
        contato: data.contato,
        email: data.email,
        telefone: data.telefone,
        endereco: data.endereco,
        categoriaMercadoria: data.categoriaMercadoria,
        observacoes: data.observacoes || '',
        agenteId: data.agenteId && data.agenteId !== "none" ? data.agenteId : undefined,
      });
      await refresh();
      toast.success("¡Cliente registrado con éxito!", { description: data.nomeFantasia });
      form.reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Error al guardar cliente", { description: e.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editClient ? `Editar cliente ${editClient.codigo || ""}` : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="razaoSocial" render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón Social *</FormLabel>
                  <FormControl><Input placeholder="Ej: Distribuidora Guaraní S.A." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="nomeFantasia" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre Fantasía *</FormLabel>
                  <FormControl><Input placeholder="Ej: Guaraní" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="rucCnpj" render={({ field }) => (
                <FormItem>
                  <FormLabel>RUC *</FormLabel>
                  <FormControl><Input placeholder="Ej: 80012345-6" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contato" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto Responsable *</FormLabel>
                  <FormControl><Input placeholder="Ej: Carlos Mendez" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo (facturación) *</FormLabel>
                  <FormControl><Input type="email" placeholder="cliente@email.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono *</FormLabel>
                  <FormControl><Input placeholder="+595 21 555-1234" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="endereco" render={({ field }) => (
              <FormItem>
                <FormLabel>Dirección *</FormLabel>
                <FormControl><Input placeholder="Av. Principal 1200, Ciudad" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="categoriaMercadoria" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Mercadería *</FormLabel>
                <FormControl><Input placeholder="Ej: Alimentos, Electrónicos, Textiles..." {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {canAgents && agentsQ.data && (
              <FormField control={form.control} name="agenteId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agente que indicó al cliente</FormLabel>
                  <Select value={field.value || "none"} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin agente (cliente directo)</SelectItem>
                      {agentsQ.data.filter((a) => a.activo || a.id === field.value).map((a) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Genera la comisión sobre el primer contrato del cliente (no en renovaciones).</p>
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem>
                <FormLabel>Observaciones</FormLabel>
                <FormControl><Textarea placeholder="Información adicional..." rows={3} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>{editClient ? "Guardar cambios" : "Guardar cliente"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

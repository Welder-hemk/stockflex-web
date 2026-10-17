import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

const schema = z.object({
  nome: z.string().trim().min(3, "Nombre y apellido").max(100),
  cargo: z.string().trim().max(100),
  tipoDocumento: z.enum(["CI", "RG", "Passaporte"]),
  documento: z.string().trim().min(3, "Documento inválido").max(20).regex(/^[0-9A-Za-z.\-\s]+$/, "Solo números y letras"),
  telefone: z.string().trim().min(6, "Teléfono inválido").max(20),
  email: z.string().trim().email("Correo inválido").max(255).or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  existingDocs?: string[];
  onDone?: () => void;
}

/** El cliente propone una persona autorizada; StockFlex la valida y la activa. */
export default function ClientAuthorizedForm({ open, onOpenChange, clienteId, existingDocs = [], onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", cargo: "", tipoDocumento: "CI", documento: "", telefone: "", email: "" },
  });

  async function onSubmit(d: FormValues) {
    const doc = d.documento.replace(/[\s.]/g, "").toUpperCase();
    if (existingDocs.map((x) => x.replace(/[\s.]/g, "").toUpperCase()).includes(doc)) {
      form.setError("documento", { message: "Esta persona ya está registrada" });
      return;
    }
    setSaving(true);
    try {
      let path: string | null = null;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB");
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        path = `${clienteId}/autorizados/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw new Error(`No se pudo subir el documento: ${upErr.message}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("authorized_contacts") as any).insert({
        cliente_id: clienteId, nome: d.nome, cargo: d.cargo, tipo_documento: d.tipoDocumento, documento: doc,
        telefone: d.telefone, email: d.email, ativo: false, solicitado_por_cliente: true,
        foto_documento_url: path, observacoes: "Solicitado por el cliente desde el portal",
      });
      if (error) throw new Error(error.message);
      toast.success("Solicitud enviada", { description: `${d.nome} quedará habilitado cuando StockFlex lo valide.` });
      form.reset();
      setFile(null);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva persona autorizada</DialogTitle>
          <DialogDescription>Podrá retirar o entregar mercadería en nombre de su empresa. Deberá presentar el documento en el depósito.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="nome" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Nombre y apellido *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="tipoDocumento" render={({ field }) => (
                <FormItem><FormLabel>Documento *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="CI">Cédula (CI)</SelectItem><SelectItem value="RG">RG (Brasil)</SelectItem><SelectItem value="Passaporte">Pasaporte</SelectItem></SelectContent>
                  </Select></FormItem>
              )} />
              <FormField control={form.control} name="documento" render={({ field }) => (<FormItem><FormLabel>Número *</FormLabel><FormControl><Input inputMode="numeric" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="cargo" render={({ field }) => (<FormItem><FormLabel>Cargo / función</FormLabel><FormControl><Input placeholder="Chofer, encargado…" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="telefone" render={({ field }) => (<FormItem><FormLabel>Teléfono *</FormLabel><FormControl><Input inputMode="tel" placeholder="+595 9…" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="email" render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Correo</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <label className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm cursor-pointer hover:bg-muted/50">
              <Upload className="h-4 w-4" />{file ? file.name : "Foto del documento (opcional, máx. 5 MB)"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Enviar solicitud</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

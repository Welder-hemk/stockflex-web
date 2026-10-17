import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { parseDbError } from "@/lib/errorMessages";
import { useState, useRef } from "react";
import { Upload, Camera, X, Loader2 } from "lucide-react";
import { uploadFile } from "@/data/storageHelpers";
import { useStockData } from "@/contexts/StockDataContext";
import { dbInsertAuthorizedContact } from "@/data/dbMutations";

const schema = z.object({
  clienteId: z.string().min(1, "Seleccione un cliente"),
  nome: z.string().trim().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  cargo: z.string().trim().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  tipoDocumento: z.enum(["CI", "RG", "Passaporte"], { required_error: "Seleccione el tipo" }),
  documento: z.string().trim().min(3, "Documento inválido").max(20, "Máximo 20 caracteres"),
  telefone: z.string().trim().min(8, "Teléfono inválido").max(20, "Máximo 20 caracteres"),
  email: z.string().trim().email("Correo inválido").max(255, "Máximo 255 caracteres"),
  ativo: z.boolean(),
  observacoes: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function AuthorizedContactForm({ open, onOpenChange }: Props) {
  const { clients, refresh } = useStockData();
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clienteId: "", nome: "", cargo: "", tipoDocumento: "CI",
      documento: "", telefone: "", email: "", ativo: true, observacoes: "",
    },
  });

  function handleDocumentFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast.error("Archivo muy grande", { description: "Máximo 5MB permitido" }); return; }
    setDocumentFile(file);
  }

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast.error("Archivo muy grande", { description: "Máximo 5MB permitido" }); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function onSubmit(data: FormValues) {
    setUploading(true);
    try {
      let docUrl: string | undefined;
      let photoUrl: string | undefined;

      // Upload files to storage buckets
      if (documentFile) {
        docUrl = await uploadFile('documents', documentFile, data.clienteId, 'doc', true);
      }
      if (photoFile) {
        photoUrl = await uploadFile('photos', photoFile, data.clienteId, 'autorizado');
      }

      await dbInsertAuthorizedContact({
        clienteId: data.clienteId,
        nome: data.nome,
        cargo: data.cargo,
        documento: data.documento,
        tipoDocumento: data.tipoDocumento,
        telefone: data.telefone,
        email: data.email,
        ativo: data.ativo,
        observacoes: data.observacoes || '',
        fotoDocumentoUrl: docUrl,
        fotoAutorizadoUrl: photoUrl,
      });
      await refresh();
      toast.success("¡Contacto autorizado registrado!", { description: data.nome });
      form.reset();
      setDocumentFile(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(parseDbError(e));
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    form.reset();
    setDocumentFile(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Contacto Autorizado</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="clienteId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem><FormLabel>Nombre Completo *</FormLabel><FormControl><Input placeholder="Ej: Roberto Villalba" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="cargo" render={({ field }) => (
                <FormItem><FormLabel>Cargo / Función *</FormLabel><FormControl><Input placeholder="Ej: Gerente de Logística" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="tipoDocumento" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Documento *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="CI">CI (Cédula de Identidad)</SelectItem>
                      <SelectItem value="RG">RG</SelectItem>
                      <SelectItem value="Passaporte">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="documento" render={({ field }) => (
                <FormItem><FormLabel>N° Documento *</FormLabel><FormControl><Input placeholder="4.521.332" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem><FormLabel>Teléfono *</FormLabel><FormControl><Input placeholder="+595 21 555-1111" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Correo Electrónico *</FormLabel><FormControl><Input type="email" placeholder="contacto@email.com" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="ativo" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="text-sm">Autorización Activa</FormLabel>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium leading-none mb-2 block">Foto del Documento (CI)</label>
                <input ref={docInputRef} type="file" accept="image/*,.pdf" onChange={handleDocumentFile} className="hidden" />
                <button type="button" onClick={() => docInputRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-accent/30 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  {documentFile ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground truncate max-w-[180px]">{documentFile.name}</span>
                      <X className="h-3.5 w-3.5 text-destructive cursor-pointer" onClick={(e) => { e.stopPropagation(); setDocumentFile(null); }} />
                    </div>
                  ) : (<span className="text-xs text-muted-foreground">Imagen o PDF (máx 5MB)</span>)}
                </button>
              </div>
              <div>
                <label className="text-sm font-medium leading-none mb-2 block">Foto del Autorizado</label>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoFile} className="hidden" />
                <button type="button" onClick={() => photoInputRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-accent/30 transition-colors">
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="Preview" className="h-16 w-16 object-cover rounded-full" />
                      <X className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full p-0.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(null); }} />
                    </div>
                  ) : (
                    <>
                      <Camera className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Cámara o archivo (máx 5MB)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <FormField control={form.control} name="observacoes" render={({ field }) => (
              <FormItem><FormLabel>Observaciones</FormLabel><FormControl><Textarea placeholder="Restricciones, período de validez..." rows={3} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={uploading}>Cancelar</Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Subiendo...</> : "Guardar Autorizado"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

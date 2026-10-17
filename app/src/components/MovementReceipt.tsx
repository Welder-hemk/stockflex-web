import type { Movement, Client, Pallet, Contract, AuthorizedContact } from "@/data/types";
import { EXTRA_COST_CATEGORIES } from "@/data/types";
import { formatNumber } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { useRef } from "react";

interface Props {
  movement: Movement;
  onClose: () => void;
  clients?: Client[];
  pallets?: Pallet[];
  contracts?: Contract[];
  authorizedContacts?: AuthorizedContact[];
}

const tipoLabel: Record<string, string> = {
  entrada: 'INGRESO DE MERCADERÍA',
  saida: 'SALIDA DE MERCADERÍA',
  transferencia: 'TRANSFERENCIA INTERNA',
  ajuste: 'AJUSTE DE INVENTARIO',
  avaria: 'REGISTRO DE AVERÍA',
  bloqueio: 'BLOQUEO/LIBERACIÓN',
};

function getLogoAbsoluteUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}logo-stockflex.png`;
}

function generateLabelHTML(pallet: any, client: any, contract: any) {
  return `
    <div style="height:148.5mm;width:210mm;padding:10mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#1a1a1a;display:flex;align-items:center;justify-content:center;">
      <div style="width:100%;height:100%;border:3px solid #1a1a1a;border-radius:12px;padding:8mm;box-sizing:border-box;display:flex;flex-direction:column;">
      <div style="text-align:center;margin-bottom:6px;">
        <img src="${getLogoAbsoluteUrl()}" alt="StockFlex" style="height:36px;margin:0 auto 4px;" onerror="this.style.display='none'" />
        <div style="font-size:10px;color:#888;">Warehouse Management System</div>
      </div>
      <div style="text-align:center;margin-bottom:6px;">
        <div style="font-size:48px;font-weight:bold;font-family:monospace;letter-spacing:4px;border:3px solid #333;border-radius:8px;display:inline-block;padding:6px 24px;line-height:1.1;">${pallet?.sku || pallet?.id || ''}</div>
      </div>
      <div style="text-align:center;margin-bottom:10px;">
        <div style="font-size:26px;font-weight:bold;font-family:monospace;letter-spacing:3px;border:2px solid #555;border-radius:6px;display:inline-block;padding:4px 16px;">${contract?.numero || ''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;font-size:12px;margin-bottom:8px;flex:1;">
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Cliente</span><br/><strong>${client?.nomeFantasia || ''}</strong></div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Descripción</span><br/>${pallet?.descricao || ''}</div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Peso</span><br/><strong>${formatNumber(pallet?.peso || 0, 2)} kg</strong></div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Ubicación${pallet?.palletDuplo ? ' (Doble)' : ''}</span><br/><strong style="font-family:monospace;font-size:16px;">${pallet?.localizacao || ''}${pallet?.palletDuplo && pallet?.localizacao2 ? ' / ' + pallet.localizacao2 : ''}</strong></div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Dimensiones (cm)</span><br/>${pallet?.largo || '-'} × ${pallet?.ancho || '-'} × ${pallet?.alto || '-'}</div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Lote</span><br/>${pallet?.lote || '—'}</div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Ingreso</span><br/>${pallet?.dataEntrada || ''}</div>
        <div><span style="font-weight:bold;color:#666;font-size:10px;text-transform:uppercase;">Seguro</span><br/>${pallet?.seguro ? 'Sí' : 'No'}</div>
      </div>
      </div>
    </div>
  `;
}

function generateReceiptHTML(movement: Movement, pallet: any, client: any, contract: any, allAuthorizedContacts?: AuthorizedContact[]) {
  const delta = movement.pesoFinal - movement.pesoInicial;
  const autName = movement.autorizadoId 
    ? (allAuthorizedContacts || []).find(a => a.id === movement.autorizadoId)?.nome 
    : (movement.operador.startsWith('Aut:') ? movement.operador : null);

  return `
    <div style="height:148.5mm;width:210mm;padding:8mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#1a1a1a;font-size:11px;">
      <div style="text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:6px;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:bold;">StockFlex Warehouse Management</div>
        <div style="font-size:10px;color:#555;">Comprobante de Movimiento de Mercadería</div>
        <div style="font-size:12px;font-weight:bold;margin-top:4px;padding:2px 10px;border:1px solid #333;display:inline-block;">
          ${tipoLabel[movement.tipo] || movement.tipo.toUpperCase()}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin-bottom:6px;">
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">N° Movimiento</span><br/>${movement.id.slice(0, 8)}</div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Fecha/Hora</span><br/>${movement.dataHora}</div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Operador</span><br/>${movement.operador}</div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Estado</span><br/>${movement.status.toUpperCase()}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin-bottom:6px;border-top:1px solid #ddd;padding-top:4px;">
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Cliente</span><br/>${client?.nomeFantasia || ''}</div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Contrato</span><br/>${contract?.numero || ''}</div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Pallet</span><br/><strong style="font-family:monospace;">${pallet?.sku || pallet?.id || ''}</strong></div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Motivo</span><br/>${movement.motivo}</div>
      </div>
      <div style="border:2px solid #333;padding:6px;margin-bottom:6px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;text-align:center;">
          <div><div style="font-size:9px;color:#666;text-transform:uppercase;font-weight:bold;">Peso Inicial</div><div style="font-size:16px;font-weight:bold;">${formatNumber(movement.pesoInicial)} kg</div></div>
          <div><div style="font-size:9px;color:#666;text-transform:uppercase;font-weight:bold;">Peso Final</div><div style="font-size:16px;font-weight:bold;">${formatNumber(movement.pesoFinal)} kg</div></div>
          <div><div style="font-size:9px;color:#666;text-transform:uppercase;font-weight:bold;">Diferencia</div><div style="font-size:16px;font-weight:bold;color:${delta < 0 ? '#dc2626' : delta > 0 ? '#16a34a' : '#666'}">${delta > 0 ? '+' : ''}${formatNumber(delta)} kg</div></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;margin-bottom:6px;">
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Origen</span><br/><span style="font-family:monospace;">${movement.origemLocal}</span></div>
        <div><span style="font-weight:bold;color:#666;font-size:9px;text-transform:uppercase;">Destino</span><br/><span style="font-family:monospace;">${movement.destinoLocal}</span></div>
      </div>
      ${movement.custoExtra ? `
        <div style="background:#fff7ed;border:1px solid #fed7aa;padding:4px 6px;margin-bottom:6px;font-size:10px;">
          <strong style="color:#9a3412;">⚠ Costo Extra:</strong> ${EXTRA_COST_CATEGORIES[movement.custoExtra.categoria]} — ${movement.custoExtra.descricao}
        </div>
      ` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16px;">
        <div style="text-align:center;">
          <div style="border-top:1px solid #333;padding-top:4px;margin-top:40px;font-size:10px;">
            <strong>Operador StockFlex</strong><br/>${movement.operador}
          </div>
        </div>
        <div style="text-align:center;">
          <div style="border-top:1px solid #333;padding-top:4px;margin-top:40px;font-size:10px;">
            <strong>${autName ? 'Autorizado del Cliente' : 'Representante del Cliente'}</strong><br/>${autName || 'Nombre / Documento'}
          </div>
        </div>
      </div>
      <div style="margin-top:8px;text-align:center;font-size:9px;color:#999;border-top:1px solid #ddd;padding-top:4px;">
        Documento generado por StockFlex WMS el ${new Date().toLocaleString('es-PY')} — Debe ser firmado por ambas partes.
      </div>
    </div>
  `;
}

export interface PrintContext {
  clients: Client[];
  pallets: Pallet[];
  contracts: Contract[];
  authorizedContacts: AuthorizedContact[];
}

export function printCombinedDocument(movement: Movement, ctx?: PrintContext) {
  const pallet = (ctx?.pallets || []).find(p => p.id === movement.palletId);
  const client = (ctx?.clients || []).find(c => c.id === movement.clienteId);
  const contract = (ctx?.contracts || []).find(ct => ct.id === movement.contratoId);
  
  const win = window.open('', '_blank');
  if (!win) return;
  
  const labelHTML = generateLabelHTML(pallet, client, contract);
  const receiptHTML = generateReceiptHTML(movement, pallet, client, contract, ctx?.authorizedContacts);
  
  const fileName = `Etiqueta - ${client?.nomeFantasia || 'Cliente'} - ${pallet?.sku || 'PLT'}`;
  
  win.document.write(`
    <html><head><title>${fileName}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: 210mm 297mm; margin: 0; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    ${labelHTML}
    ${receiptHTML}
    <script>
      var imgs = document.images;
      if (imgs.length === 0) { window.print(); }
      else {
        var loaded = 0;
        for (var i = 0; i < imgs.length; i++) {
          if (imgs[i].complete) { loaded++; }
          else { imgs[i].onload = imgs[i].onerror = function() { loaded++; if (loaded >= imgs.length) window.print(); }; }
        }
        if (loaded >= imgs.length) window.print();
      }
    </script>
    </body></html>
  `);
  win.document.close();
}

export function printLabelOnly(palletId: string, ctx?: PrintContext) {
  const pallet = (ctx?.pallets || []).find(p => p.id === palletId);
  if (!pallet) return;
  const client = (ctx?.clients || []).find(c => c.id === pallet.clienteId);
  const contract = (ctx?.contracts || []).find(ct => ct.id === pallet.contratoId);
  
  const fileName = `Etiqueta - ${client?.nomeFantasia || 'Cliente'} - ${pallet?.sku || 'PLT'}`;
  
  const win = window.open('', '_blank');
  if (!win) return;
  
  win.document.write(`
    <html><head><title>${fileName}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: 210mm 148.5mm; margin: 0; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    ${generateLabelHTML(pallet, client, contract)}
    <script>
      var imgs = document.images;
      if (imgs.length === 0) { window.print(); }
      else {
        var loaded = 0;
        for (var i = 0; i < imgs.length; i++) {
          if (imgs[i].complete) { loaded++; }
          else { imgs[i].onload = imgs[i].onerror = function() { loaded++; if (loaded >= imgs.length) window.print(); }; }
        }
        if (loaded >= imgs.length) window.print();
      }
    </script>
    </body></html>
  `);
  win.document.close();
}

export default function MovementReceipt({ movement, onClose, clients = [], pallets = [], contracts = [], authorizedContacts = [] }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const client = clients.find(c => c.id === movement.clienteId);
  const pallet = pallets.find(p => p.id === movement.palletId);
  const contract = contracts.find(ct => ct.id === movement.contratoId);
  const autName = movement.autorizadoId 
    ? authorizedContacts.find(a => a.id === movement.autorizadoId)?.nome 
    : (movement.operador.startsWith('Aut:') ? movement.operador : null);

  const delta = movement.pesoFinal - movement.pesoInicial;
  const ctx: PrintContext = { clients, pallets, contracts, authorizedContacts };

  const handlePrint = () => printCombinedDocument(movement, ctx);
  const handlePrintReceiptOnly = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Comprobante ${movement.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 210mm 148.5mm; margin: 0; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      ${generateReceiptHTML(movement, pallet, client, contract, authorizedContacts)}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-foreground">Comprobante de Movimiento</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handlePrintReceiptOnly}><Printer className="h-4 w-4 mr-1" /> Solo Comprobante</Button>
            <Button size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Etiqueta + Comprobante</Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div ref={printRef} className="p-8 text-sm text-gray-900">
          <div className="header text-center border-b-2 border-gray-900 pb-4 mb-5">
            <h1 className="text-lg font-bold">StockFlex Warehouse Management</h1>
            <h2 className="text-sm text-gray-500">Comprobante de Movimiento de Mercadería</h2>
            <div className="doc-type inline-block mt-2 px-3 py-1 border border-gray-700 font-bold text-sm">
              {tipoLabel[movement.tipo] || movement.tipo.toUpperCase()}
            </div>
          </div>

          <div className="section mb-4">
            <div className="section-title font-bold bg-gray-200 px-2 py-1 mb-2 text-xs">DATOS DEL MOVIMIENTO</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">N° Movimiento</div><div className="value">{movement.id}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Fecha/Hora</div><div className="value">{movement.dataHora}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Operador</div><div className="value">{movement.operador}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Estado</div><div className="value">{movement.status.toUpperCase()}</div></div>
            </div>
          </div>

          <div className="section mb-4">
            <div className="section-title font-bold bg-gray-200 px-2 py-1 mb-2 text-xs">CLIENTE / CONTRATO</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Cliente</div><div className="value">{client?.nomeFantasia} — {client?.razaoSocial}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">RUC</div><div className="value">{client?.rucCnpj}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Contrato</div><div className="value">{contract?.numero}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Motivo</div><div className="value">{movement.motivo}</div></div>
            </div>
          </div>

          <div className="section mb-4">
            <div className="section-title font-bold bg-gray-200 px-2 py-1 mb-2 text-xs">PALLET / MERCADERÍA</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Registro PLT</div><div className="value text-lg font-bold font-mono tracking-wider">{pallet?.sku || pallet?.id}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Descripción</div><div className="value">{pallet?.descricao}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Peso Registrado</div><div className="value">{formatNumber(pallet?.peso || 0)} kg</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Ubicación</div><div className="value font-mono">{pallet?.localizacao || ''}{pallet?.palletDuplo && pallet?.localizacao2 ? ` / ${pallet.localizacao2}` : ''}</div></div>
            </div>
          </div>

          <div className="section mb-4">
            <div className="section-title font-bold bg-gray-200 px-2 py-1 mb-2 text-xs">CONTROL DE PESO (PESAJE)</div>
            <div className="weight-box border-2 border-gray-800 p-3 mt-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Peso Inicial</div>
                  <div className="text-lg font-bold">{formatNumber(movement.pesoInicial)} kg</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Peso Final</div>
                  <div className="text-lg font-bold">{formatNumber(movement.pesoFinal)} kg</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Diferencia</div>
                  <div className={`text-lg font-bold ${delta < 0 ? 'text-red-600' : delta > 0 ? 'text-green-600' : ''}`}>
                    {delta > 0 ? '+' : ''}{formatNumber(delta)} kg
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section mb-4">
            <div className="section-title font-bold bg-gray-200 px-2 py-1 mb-2 text-xs">UBICACIÓN</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Origen</div><div className="value font-mono">{movement.origemLocal}</div></div>
              <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Destino</div><div className="value font-mono">{movement.destinoLocal}</div></div>
            </div>
          </div>

          {movement.custoExtra && (
            <div className="section mb-4">
              <div className="section-title font-bold bg-orange-100 px-2 py-1 mb-2 text-xs text-orange-800">⚠ COSTO EXTRA ASOCIADO</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Categoría</div><div className="value font-medium">{EXTRA_COST_CATEGORIES[movement.custoExtra.categoria]}</div></div>
                <div className="field"><div className="label text-[10px] text-gray-500 uppercase font-bold">Descripción</div><div className="value">{movement.custoExtra.descricao}</div></div>
              </div>
              <div className="text-[10px] text-orange-700 mt-1">Este costo será incluido en el cierre mensual para aprobación y facturación.</div>
            </div>
          )}

          <div className="signatures grid grid-cols-2 gap-12 mt-8">
            <div className="text-center">
              <div className="border-t border-gray-900 pt-2 mt-12">
                <div className="text-xs font-bold">Operador StockFlex</div>
                <div className="text-xs text-gray-500">{movement.operador}</div>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-900 pt-2 mt-12">
                <div className="text-xs font-bold">{autName ? 'Autorizado del Cliente' : 'Representante del Cliente'}</div>
                <div className="text-xs text-gray-500">{autName || 'Nombre / Documento'}</div>
              </div>
            </div>
          </div>

          <div className="text-center text-[10px] text-gray-400 mt-4 pt-2 border-t">
            Documento generado por StockFlex WMS el {new Date().toLocaleString('es-PY')} — Debe ser firmado por ambas partes.
          </div>
        </div>
      </div>
    </div>
  );
}

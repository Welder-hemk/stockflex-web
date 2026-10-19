// Secciones del menú agrupadas en pestañas
import { lazy } from "react";
import { Package, ArrowLeftRight, MapPin, Target, Users, Building2, FileSignature } from "lucide-react";
import SectionHub from "@/components/layout/SectionHub";

const Pallets = lazy(() => import("@/pages/Pallets"));
const Movements = lazy(() => import("@/pages/Movements"));
const WarehouseMap = lazy(() => import("@/pages/WarehouseMap"));
const Prospects = lazy(() => import("@/pages/Prospects"));
const Clients = lazy(() => import("@/pages/Clients"));
const Warehouses = lazy(() => import("@/pages/Warehouses"));
const ContractTemplatePage = lazy(() => import("@/pages/ContractTemplate"));

export function DepositoHub() {
  return (
    <SectionHub
      title="Depósito"
      tabs={[
        { key: "pallets", label: "Pallets", icon: Package, component: Pallets },
        { key: "movimientos", label: "Movimientos", icon: ArrowLeftRight, component: Movements },
        { key: "mapa", label: "Mapa del depósito", icon: MapPin, component: WarehouseMap },
      ]}
    />
  );
}

export function ComercialHub() {
  return (
    <SectionHub
      title="Comercial"
      tabs={[
        { key: "clientes", label: "Clientes", icon: Users, component: Clients },
        { key: "prospectos", label: "Prospectos", icon: Target, component: Prospects },
      ]}
    />
  );
}

export function ConfigHub() {
  return (
    <SectionHub
      title="Configuraciones"
      tabs={[
        { key: "depositos", label: "Depósitos", icon: Building2, component: Warehouses },
        { key: "contrato", label: "Modelo de contrato", icon: FileSignature, component: ContractTemplatePage },
      ]}
    />
  );
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      authorized_contacts: {
        Row: {
          ativo: boolean
          cargo: string
          cliente_id: string
          created_at: string
          documento: string
          email: string
          foto_autorizado_url: string | null
          foto_documento: string | null
          foto_documento_url: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string
          tipo_documento: Database["public"]["Enums"]["doc_type"]
        }
        Insert: {
          ativo?: boolean
          cargo?: string
          cliente_id: string
          created_at?: string
          documento?: string
          email?: string
          foto_autorizado_url?: string | null
          foto_documento?: string | null
          foto_documento_url?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string
          tipo_documento?: Database["public"]["Enums"]["doc_type"]
        }
        Update: {
          ativo?: boolean
          cargo?: string
          cliente_id?: string
          created_at?: string
          documento?: string
          email?: string
          foto_autorizado_url?: string | null
          foto_documento?: string | null
          foto_documento_url?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string
          tipo_documento?: Database["public"]["Enums"]["doc_type"]
        }
        Relationships: [
          {
            foreignKeyName: "authorized_contacts_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          cliente_id: string
          created_at: string
          data_criacao: string
          data_estimada: string
          horario_estimado: string
          id: string
          margem_tempo: number
          movimento_ids: string[] | null
          observacoes: string | null
          operador_id: string | null
          pallet_ids: string[]
          quantidade: number | null
          status: Database["public"]["Enums"]["request_status"]
          tipo: Database["public"]["Enums"]["request_type"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_criacao?: string
          data_estimada?: string
          horario_estimado?: string
          id?: string
          margem_tempo?: number
          movimento_ids?: string[] | null
          observacoes?: string | null
          operador_id?: string | null
          pallet_ids?: string[]
          quantidade?: number | null
          status?: Database["public"]["Enums"]["request_status"]
          tipo: Database["public"]["Enums"]["request_type"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_criacao?: string
          data_estimada?: string
          horario_estimado?: string
          id?: string
          margem_tempo?: number
          movimento_ids?: string[] | null
          observacoes?: string | null
          operador_id?: string | null
          pallet_ids?: string[]
          quantidade?: number | null
          status?: Database["public"]["Enums"]["request_status"]
          tipo?: Database["public"]["Enums"]["request_type"]
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          categoria_mercadoria: string
          codigo: string
          contato: string
          created_at: string
          email: string
          endereco: string
          id: string
          nome_fantasia: string
          observacoes: string | null
          razao_social: string
          ruc_cnpj: string
          telefone: string
        }
        Insert: {
          categoria_mercadoria?: string
          codigo: string
          contato?: string
          created_at?: string
          email?: string
          endereco?: string
          id?: string
          nome_fantasia?: string
          observacoes?: string | null
          razao_social: string
          ruc_cnpj?: string
          telefone?: string
        }
        Update: {
          categoria_mercadoria?: string
          codigo?: string
          contato?: string
          created_at?: string
          email?: string
          endereco?: string
          id?: string
          nome_fantasia?: string
          observacoes?: string | null
          razao_social?: string
          ruc_cnpj?: string
          telefone?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          cliente_id: string
          created_at: string
          data_inicio: string
          data_termino: string
          id: string
          moeda: string
          movimentacoes_inclusas: number
          numero: string
          observacoes: string | null
          percentual_seguro: number
          posicoes_contratadas: number
          posicoes_ocupadas: number
          preco_mov_extra: number
          preco_por_posicao: number
          status: Database["public"]["Enums"]["contract_status"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_inicio: string
          data_termino: string
          id?: string
          moeda?: string
          movimentacoes_inclusas?: number
          numero: string
          observacoes?: string | null
          percentual_seguro?: number
          posicoes_contratadas?: number
          posicoes_ocupadas?: number
          preco_mov_extra?: number
          preco_por_posicao?: number
          status?: Database["public"]["Enums"]["contract_status"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_inicio?: string
          data_termino?: string
          id?: string
          moeda?: string
          movimentacoes_inclusas?: number
          numero?: string
          observacoes?: string | null
          percentual_seguro?: number
          posicoes_contratadas?: number
          posicoes_ocupadas?: number
          preco_mov_extra?: number
          preco_por_posicao?: number
          status?: Database["public"]["Enums"]["contract_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contracts_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          cambio_dia: number | null
          categoria: Database["public"]["Enums"]["expense_category"]
          competencia: string
          created_at: string
          data_criacao: string
          data_vencimento: string
          descricao: string
          id: string
          moeda: string
          observacoes: string | null
          status: Database["public"]["Enums"]["expense_status"]
          valor: number
          valor_usd: number
        }
        Insert: {
          cambio_dia?: number | null
          categoria: Database["public"]["Enums"]["expense_category"]
          competencia: string
          created_at?: string
          data_criacao?: string
          data_vencimento: string
          descricao?: string
          id?: string
          moeda?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          valor?: number
          valor_usd?: number
        }
        Update: {
          cambio_dia?: number | null
          categoria?: Database["public"]["Enums"]["expense_category"]
          competencia?: string
          created_at?: string
          data_criacao?: string
          data_vencimento?: string
          descricao?: string
          id?: string
          moeda?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          valor?: number
          valor_usd?: number
        }
        Relationships: []
      }
      extra_costs: {
        Row: {
          categoria: Database["public"]["Enums"]["extra_cost_category"]
          cliente_id: string
          competencia: string
          contrato_id: string
          created_at: string
          data_criacao: string
          descricao: string
          id: string
          moeda: string
          movimentacao_id: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["cost_origin"]
          quantidade: number
          status_aprovacao: Database["public"]["Enums"]["cost_approval"]
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          categoria: Database["public"]["Enums"]["extra_cost_category"]
          cliente_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          data_criacao?: string
          descricao?: string
          id?: string
          moeda?: string
          movimentacao_id?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["cost_origin"]
          quantidade?: number
          status_aprovacao?: Database["public"]["Enums"]["cost_approval"]
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          categoria?: Database["public"]["Enums"]["extra_cost_category"]
          cliente_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          data_criacao?: string
          descricao?: string
          id?: string
          moeda?: string
          movimentacao_id?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["cost_origin"]
          quantidade?: number
          status_aprovacao?: Database["public"]["Enums"]["cost_approval"]
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "extra_costs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extra_costs_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cliente_id: string
          competencia: string
          comprovante: string | null
          comprovante_data: string | null
          contrato_id: string
          created_at: string
          data_vencimento: string
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          valor: number
        }
        Insert: {
          cliente_id: string
          competencia: string
          comprovante?: string | null
          comprovante_data?: string | null
          contrato_id: string
          created_at?: string
          data_vencimento: string
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          valor?: number
        }
        Update: {
          cliente_id?: string
          competencia?: string
          comprovante?: string | null
          comprovante_data?: string | null
          contrato_id?: string
          created_at?: string
          data_vencimento?: string
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          autorizado_id: string | null
          cliente_id: string
          comprovante_assinado: string | null
          comprovante_data: string | null
          contrato_id: string
          created_at: string
          custo_extra_categoria:
            | Database["public"]["Enums"]["extra_cost_category"]
            | null
          custo_extra_descricao: string | null
          data_hora: string
          destino_local: string
          id: string
          interna: boolean | null
          motivo: string
          novo_valor_declarado: number | null
          operador: string
          operador_id: string | null
          origem_local: string
          pallet_id: string
          peso_final: number
          peso_inicial: number
          status: Database["public"]["Enums"]["movement_status"]
          tipo: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          autorizado_id?: string | null
          cliente_id: string
          comprovante_assinado?: string | null
          comprovante_data?: string | null
          contrato_id: string
          created_at?: string
          custo_extra_categoria?:
            | Database["public"]["Enums"]["extra_cost_category"]
            | null
          custo_extra_descricao?: string | null
          data_hora?: string
          destino_local?: string
          id?: string
          interna?: boolean | null
          motivo?: string
          novo_valor_declarado?: number | null
          operador?: string
          operador_id?: string | null
          origem_local?: string
          pallet_id: string
          peso_final?: number
          peso_inicial?: number
          status?: Database["public"]["Enums"]["movement_status"]
          tipo: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          autorizado_id?: string | null
          cliente_id?: string
          comprovante_assinado?: string | null
          comprovante_data?: string | null
          contrato_id?: string
          created_at?: string
          custo_extra_categoria?:
            | Database["public"]["Enums"]["extra_cost_category"]
            | null
          custo_extra_descricao?: string | null
          data_hora?: string
          destino_local?: string
          id?: string
          interna?: boolean | null
          motivo?: string
          novo_valor_declarado?: number | null
          operador?: string
          operador_id?: string | null
          origem_local?: string
          pallet_id?: string
          peso_final?: number
          peso_inicial?: number
          status?: Database["public"]["Enums"]["movement_status"]
          tipo?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
        ]
      }
      pallets: {
        Row: {
          alto: number | null
          ancho: number | null
          cliente_id: string
          contrato_id: string
          created_at: string
          data_entrada: string
          descricao: string
          id: string
          largo: number | null
          localizacao: string
          localizacao2: string | null
          lote: string | null
          pallet_duplo: boolean | null
          peso: number
          quantidade: number | null
          seguro: boolean
          sku: string
          status: Database["public"]["Enums"]["pallet_status"]
          ultima_movimentacao: string
          valor_declarado: number
        }
        Insert: {
          alto?: number | null
          ancho?: number | null
          cliente_id: string
          contrato_id: string
          created_at?: string
          data_entrada?: string
          descricao?: string
          id?: string
          largo?: number | null
          localizacao?: string
          localizacao2?: string | null
          lote?: string | null
          pallet_duplo?: boolean | null
          peso?: number
          quantidade?: number | null
          seguro?: boolean
          sku: string
          status?: Database["public"]["Enums"]["pallet_status"]
          ultima_movimentacao?: string
          valor_declarado?: number
        }
        Update: {
          alto?: number | null
          ancho?: number | null
          cliente_id?: string
          contrato_id?: string
          created_at?: string
          data_entrada?: string
          descricao?: string
          id?: string
          largo?: number | null
          localizacao?: string
          localizacao2?: string | null
          lote?: string | null
          pallet_duplo?: boolean | null
          peso?: number
          quantidade?: number | null
          seguro?: boolean
          sku?: string
          status?: Database["public"]["Enums"]["pallet_status"]
          ultima_movimentacao?: string
          valor_declarado?: number
        }
        Relationships: [
          {
            foreignKeyName: "pallets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pallets_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          cliente_id: string | null
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          email: string
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_logs: {
        Row: {
          created_at: string
          id: string
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          cliente_id: string | null
          contrato_id: string | null
          created_at: string
          fecha: string
          id: string
          mensaje: string
          resuelto: boolean
          tipo: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          mensaje: string
          resuelto?: boolean
          tipo: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          cliente_id?: string | null
          contrato_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          mensaje?: string
          resuelto?: boolean
          tipo?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_positions: {
        Row: {
          bloco: number
          capacidade_kg: number
          cliente_id: string | null
          id: string
          nivel: number
          pallet_id: string | null
          posicao: number
          rua: string
          status: Database["public"]["Enums"]["cell_status"]
        }
        Insert: {
          bloco: number
          capacidade_kg?: number
          cliente_id?: string | null
          id: string
          nivel: number
          pallet_id?: string | null
          posicao: number
          rua: string
          status?: Database["public"]["Enums"]["cell_status"]
        }
        Update: {
          bloco?: number
          capacidade_kg?: number
          cliente_id?: string | null
          id?: string
          nivel?: number
          pallet_id?: string | null
          posicao?: number
          rua?: string
          status?: Database["public"]["Enums"]["cell_status"]
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_positions_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_positions_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_financial_summary: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: Json
      }
      dashboard_occupancy_by_client: { Args: never; Returns: Json }
      dashboard_stats: { Args: never; Returns: Json }
      delete_pallet_safe: { Args: { p_pallet_id: string }; Returns: Json }
      execute_pallet_exit: {
        Args: {
          p_autorizado_id?: string
          p_destino?: string
          p_motivo?: string
          p_operador?: string
          p_operador_id?: string
          p_pallet_id: string
          p_peso_final?: number
        }
        Returns: Json
      }
      get_user_client_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_financeiro: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      monthly_close_data: {
        Args: { p_client_id?: string; p_month: string }
        Returns: Json
      }
      register_pallet_entry: {
        Args: {
          p_alto?: number
          p_ancho?: number
          p_cliente_id: string
          p_contrato_id: string
          p_descricao: string
          p_largo?: number
          p_localizacao?: string
          p_localizacao2?: string
          p_lote?: string
          p_operador?: string
          p_operador_id?: string
          p_pallet_duplo?: boolean
          p_peso?: number
          p_position_id?: string
          p_position2_id?: string
          p_quantidade?: number
          p_seguro?: boolean
          p_sku: string
          p_valor_declarado?: number
        }
        Returns: Json
      }
      transfer_pallet: {
        Args: {
          p_motivo?: string
          p_new_position_id: string
          p_new_position2_id?: string
          p_operador?: string
          p_operador_id?: string
          p_pallet_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      alert_type: "capacidad" | "contrato" | "vencimiento" | "operacion"
      app_role: "admin" | "operador" | "financeiro" | "cliente"
      cell_status: "free" | "occupied" | "blocked" | "reserved"
      contract_status:
        | "rascunho"
        | "ativo"
        | "suspenso"
        | "vencido"
        | "encerrado"
      cost_approval: "pendente" | "aprovado"
      cost_origin: "operador" | "admin"
      doc_type: "CI" | "RG" | "Passaporte"
      expense_category:
        | "alquiler"
        | "salarios"
        | "servicios"
        | "mantenimiento"
        | "combustible"
        | "seguros"
        | "impuestos"
        | "insumos"
        | "otros"
      expense_status: "pendente" | "pago" | "vencido"
      extra_cost_category:
        | "movimentacao_extra"
        | "embalagem"
        | "pallet_extra"
        | "frete"
        | "seguro_adicional"
        | "mao_de_obra"
        | "outros"
      invoice_status: "pago" | "pendente" | "vencido"
      movement_status: "solicitada" | "aprovada" | "executada" | "cancelada"
      movement_type:
        | "entrada"
        | "saida"
        | "transferencia"
        | "ajuste"
        | "avaria"
        | "bloqueio"
      pallet_status:
        | "aguardando_entrada"
        | "armazenado"
        | "reservado_saida"
        | "em_transferencia"
        | "expedido"
      request_status: "pendente" | "separado" | "executado" | "cancelado"
      request_type: "coleta" | "acesso" | "ingreso"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_type: ["capacidad", "contrato", "vencimiento", "operacion"],
      app_role: ["admin", "operador", "financeiro", "cliente"],
      cell_status: ["free", "occupied", "blocked", "reserved"],
      contract_status: [
        "rascunho",
        "ativo",
        "suspenso",
        "vencido",
        "encerrado",
      ],
      cost_approval: ["pendente", "aprovado"],
      cost_origin: ["operador", "admin"],
      doc_type: ["CI", "RG", "Passaporte"],
      expense_category: [
        "alquiler",
        "salarios",
        "servicios",
        "mantenimiento",
        "combustible",
        "seguros",
        "impuestos",
        "insumos",
        "otros",
      ],
      expense_status: ["pendente", "pago", "vencido"],
      extra_cost_category: [
        "movimentacao_extra",
        "embalagem",
        "pallet_extra",
        "frete",
        "seguro_adicional",
        "mao_de_obra",
        "outros",
      ],
      invoice_status: ["pago", "pendente", "vencido"],
      movement_status: ["solicitada", "aprovada", "executada", "cancelada"],
      movement_type: [
        "entrada",
        "saida",
        "transferencia",
        "ajuste",
        "avaria",
        "bloqueio",
      ],
      pallet_status: [
        "aguardando_entrada",
        "armazenado",
        "reservado_saida",
        "em_transferencia",
        "expedido",
      ],
      request_status: ["pendente", "separado", "executado", "cancelado"],
      request_type: ["coleta", "acesso", "ingreso"],
    },
  },
} as const

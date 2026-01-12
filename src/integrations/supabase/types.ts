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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      blockchain_settings: {
        Row: {
          chain_id: string | null
          created_at: string
          explorer_url: string | null
          fee_wallet_address: string | null
          id: string
          is_active: boolean
          liquidity_pool_address: string | null
          native_coin_name: string
          native_coin_symbol: string
          rpc_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chain_id?: string | null
          created_at?: string
          explorer_url?: string | null
          fee_wallet_address?: string | null
          id?: string
          is_active?: boolean
          liquidity_pool_address?: string | null
          native_coin_name?: string
          native_coin_symbol?: string
          rpc_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chain_id?: string | null
          created_at?: string
          explorer_url?: string | null
          fee_wallet_address?: string | null
          id?: string
          is_active?: boolean
          liquidity_pool_address?: string | null
          native_coin_name?: string
          native_coin_symbol?: string
          rpc_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      conversion_fees: {
        Row: {
          created_at: string
          fee_percentage: number
          from_coin: string
          id: string
          is_active: boolean
          to_coin: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fee_percentage?: number
          from_coin: string
          id?: string
          is_active?: boolean
          to_coin: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fee_percentage?: number
          from_coin?: string
          id?: string
          is_active?: boolean
          to_coin?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      database_backups: {
        Row: {
          backup_name: string
          backup_type: string
          created_at: string
          external_db_id: string | null
          file_size: number | null
          id: string
          status: string
        }
        Insert: {
          backup_name: string
          backup_type?: string
          created_at?: string
          external_db_id?: string | null
          file_size?: number | null
          id?: string
          status?: string
        }
        Update: {
          backup_name?: string
          backup_type?: string
          created_at?: string
          external_db_id?: string | null
          file_size?: number | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "database_backups_external_db_id_fkey"
            columns: ["external_db_id"]
            isOneToOne: false
            referencedRelation: "external_databases"
            referencedColumns: ["id"]
          },
        ]
      }
      external_databases: {
        Row: {
          created_at: string
          created_by: string | null
          database_name: string
          host: string
          id: string
          name: string
          port: number
          secret_key: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          database_name: string
          host: string
          id?: string
          name: string
          port?: number
          secret_key: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          database_name?: string
          host?: string
          id?: string
          name?: string
          port?: number
          secret_key?: string
          username?: string
        }
        Relationships: []
      }
      feature_toggles: {
        Row: {
          feature_key: string
          feature_name: string
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          feature_key: string
          feature_name: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          feature_key?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fund_requests: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          payer_id: string
          requester_id: string
          status: string
          verification_code: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          payer_id: string
          requester_id: string
          status?: string
          verification_code: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          payer_id?: string
          requester_id?: string
          status?: string
          verification_code?: string
        }
        Relationships: []
      }
      pending_deposits: {
        Row: {
          agent_id: string
          amount: number
          approved_by: string | null
          created_at: string
          id: string
          processed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          agent_id: string
          amount: number
          approved_by?: string | null
          created_at?: string
          id?: string
          processed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          amount?: number
          approved_by?: string | null
          created_at?: string
          id?: string
          processed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          id: string
          phone_number: string | null
          store_name: string | null
          updated_at: string
          wallet_address: string | null
          wallet_created_at: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id: string
          phone_number?: string | null
          store_name?: string | null
          updated_at?: string
          wallet_address?: string | null
          wallet_created_at?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          phone_number?: string | null
          store_name?: string | null
          updated_at?: string
          wallet_address?: string | null
          wallet_created_at?: string | null
        }
        Relationships: []
      }
      supported_coins: {
        Row: {
          coin_name: string
          coin_symbol: string
          contract_address: string | null
          created_at: string
          id: string
          is_active: boolean
          is_native: boolean
          updated_at: string
        }
        Insert: {
          coin_name: string
          coin_symbol: string
          contract_address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_native?: boolean
          updated_at?: string
        }
        Update: {
          coin_name?: string
          coin_symbol?: string
          contract_address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_native?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      transaction_fees: {
        Row: {
          fee_percentage: number
          fixed_fee: number
          id: string
          transaction_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fee_percentage?: number
          fixed_fee?: number
          id?: string
          transaction_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fee_percentage?: number
          fixed_fee?: number
          id?: string
          transaction_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          description: string | null
          fee: number
          id: string
          receiver_id: string
          sender_id: string
          status: string
          transaction_type: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          fee?: number
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          fee?: number
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          transaction_type?: string
        }
        Relationships: []
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
      user_wallets: {
        Row: {
          created_at: string
          encrypted_private_key: string
          id: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          encrypted_private_key: string
          id?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          encrypted_private_key?: string
          id?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      vendor_products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          discount_price: number | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          price: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          discount_price?: number | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          price: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          discount_price?: number | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          price?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: []
      }
      vendor_registration_fees: {
        Row: {
          fee_amount: number
          fee_name: string
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fee_amount?: number
          fee_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fee_amount?: number
          fee_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_funds: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_transaction: {
        Args: {
          _amount: number
          _description?: string
          _receiver_id: string
          _sender_id: string
          _transaction_type: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "agent" | "client" | "vendor"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "agent", "client", "vendor"],
    },
  },
} as const

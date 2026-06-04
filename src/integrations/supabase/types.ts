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
      announcements: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string | null
          file_size: number | null
          file_url: string
          id: string
          is_force_update: boolean
          is_latest: boolean
          platform: string
          release_notes: string | null
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          is_force_update?: boolean
          is_latest?: boolean
          platform?: string
          release_notes?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          is_force_update?: boolean
          is_latest?: boolean
          platform?: string
          release_notes?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      biometric_credentials: {
        Row: {
          auth_type: string
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          auth_type?: string
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          auth_type?: string
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      blockchain_settings: {
        Row: {
          chain_id: string | null
          created_at: string
          explorer_url: string | null
          fee_wallet_address: string | null
          fee_wallet_encrypted_key: string | null
          gas_fee_gyd: number
          id: string
          is_active: boolean
          liquidity_pool_address: string | null
          native_coin_name: string
          native_coin_symbol: string
          rpc_url: string | null
          rpc_urls: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chain_id?: string | null
          created_at?: string
          explorer_url?: string | null
          fee_wallet_address?: string | null
          fee_wallet_encrypted_key?: string | null
          gas_fee_gyd?: number
          id?: string
          is_active?: boolean
          liquidity_pool_address?: string | null
          native_coin_name?: string
          native_coin_symbol?: string
          rpc_url?: string | null
          rpc_urls?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chain_id?: string | null
          created_at?: string
          explorer_url?: string | null
          fee_wallet_address?: string | null
          fee_wallet_encrypted_key?: string | null
          gas_fee_gyd?: number
          id?: string
          is_active?: boolean
          liquidity_pool_address?: string | null
          native_coin_name?: string
          native_coin_symbol?: string
          rpc_url?: string | null
          rpc_urls?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      changelog_entries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_latest: boolean
          items: Json
          released_at: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_latest?: boolean
          items?: Json
          released_at?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_latest?: boolean
          items?: Json
          released_at?: string
          version?: string
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
      countries: {
        Row: {
          code: string
          created_at: string
          dial_code: string
          id: string
          is_allowed: boolean
          is_banned: boolean
          local_number_length: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          dial_code: string
          id?: string
          is_allowed?: boolean
          is_banned?: boolean
          local_number_length?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          dial_code?: string
          id?: string
          is_allowed?: boolean
          is_banned?: boolean
          local_number_length?: number
          name?: string
          sort_order?: number
          updated_at?: string
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
      device_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_name: string | null
          id: string
          ip_address: string | null
          is_current: boolean
          last_active_at: string
          location: string | null
          os: string | null
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          last_active_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          last_active_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      fund_reversals: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          funds_held_at: string | null
          funds_returned_at: string | null
          id: string
          reason: string | null
          recipient_id: string
          requested_at: string
          requester_id: string
          status: string
          transaction_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          funds_held_at?: string | null
          funds_returned_at?: string | null
          id?: string
          reason?: string | null
          recipient_id: string
          requested_at?: string
          requester_id: string
          status?: string
          transaction_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          funds_held_at?: string | null
          funds_returned_at?: string | null
          id?: string
          reason?: string | null
          recipient_id?: string
          requested_at?: string
          requester_id?: string
          status?: string
          transaction_id?: string
        }
        Relationships: []
      }
      gas_fee_ledger: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          related_transaction_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          related_transaction_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          related_transaction_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      kyc_submissions: {
        Row: {
          address: string
          country: string
          created_at: string
          date_of_birth: string
          document_back_url: string | null
          document_front_url: string | null
          document_number: string
          document_type: string
          full_name: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          country: string
          created_at?: string
          date_of_birth: string
          document_back_url?: string | null
          document_front_url?: string | null
          document_number: string
          document_type: string
          full_name: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          country?: string
          created_at?: string
          date_of_birth?: string
          document_back_url?: string | null
          document_front_url?: string | null
          document_number?: string
          document_type?: string
          full_name?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mobile_money_providers: {
        Row: {
          color: string
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          logo_letter: string
          merchant_number: string | null
          name: string
          sort_order: number
          updated_at: string
          ussd_code: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          logo_letter?: string
          merchant_number?: string | null
          name: string
          sort_order?: number
          updated_at?: string
          ussd_code?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          logo_letter?: string
          merchant_number?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
          ussd_code?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
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
          disabled: boolean
          disabled_at: string | null
          disabled_by: string | null
          full_name: string | null
          id: string
          kyc_status: string
          phone_number: string | null
          pin_hash: string | null
          store_name: string | null
          two_factor_enabled: boolean
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
          disabled?: boolean
          disabled_at?: string | null
          disabled_by?: string | null
          full_name?: string | null
          id: string
          kyc_status?: string
          phone_number?: string | null
          pin_hash?: string | null
          store_name?: string | null
          two_factor_enabled?: boolean
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
          disabled?: boolean
          disabled_at?: string | null
          disabled_by?: string | null
          full_name?: string | null
          id?: string
          kyc_status?: string
          phone_number?: string | null
          pin_hash?: string | null
          store_name?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
          wallet_address?: string | null
          wallet_created_at?: string | null
        }
        Relationships: []
      }
      qr_card_requests: {
        Row: {
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          notes: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_card_requests_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_card_requests_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
        ]
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
      suspicious_activity_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string
          id: string
          metadata: Json
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
          user_id?: string | null
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
      two_factor_auth: {
        Row: {
          backup_codes: string[]
          created_at: string
          enabled: boolean
          id: string
          secret: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          backup_codes?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          secret: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          backup_codes?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          secret?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
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
      public_vendors: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
          store_name: string | null
          wallet_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          store_name?: string | null
          wallet_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          store_name?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_funds: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      approve_fund_reversal: { Args: { _reversal_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_pin: { Args: { pin: string }; Returns: string }
      log_audit_event: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type?: string
          _metadata?: Json
        }
        Returns: string
      }
      process_pending_reversals: { Args: never; Returns: Json }
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
      set_user_pin: { Args: { user_pin: string }; Returns: boolean }
      verify_pin: { Args: { pin: string; user_id: string }; Returns: boolean }
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

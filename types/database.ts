// Generated from the Supabase schema. Regenerate after every migration:
//   npx supabase gen types typescript --project-id vqlojnnhefjrozwttkgz > types/database.ts

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      billing_payments: {
        Row: {
          amount_paise: number
          business_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          owner_id: string | null
          paid_at: string | null
          payment_type: string
          plan_id: string | null
          provider: string
          provider_invoice_id: string | null
          provider_order_id: string | null
          provider_payment_id: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_paise: number
          business_id?: string | null
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          owner_id?: string | null
          paid_at?: string | null
          payment_type?: string
          plan_id?: string | null
          provider: string
          provider_invoice_id?: string | null
          provider_order_id?: string | null
          provider_payment_id: string
          status: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          business_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          owner_id?: string | null
          paid_at?: string | null
          payment_type?: string
          plan_id?: string | null
          provider?: string
          provider_invoice_id?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "business_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string
          id: string
          is_active: boolean
          is_price_final: boolean
          name: string
          price_paise: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_active?: boolean
          is_price_final?: boolean
          name: string
          price_paise: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_active?: boolean
          is_price_final?: boolean
          name?: string
          price_paise?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
        ]
      }
      billing_webhook_events: {
        Row: {
          attempts: number
          business_id: string | null
          error: string | null
          event_type: string | null
          id: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          provider_subscription_id: string | null
          received_at: string
          status: string
        }
        Insert: {
          attempts?: number
          business_id?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          processed_at?: string | null
          provider: string
          provider_event_id: string
          provider_subscription_id?: string | null
          received_at?: string
          status: string
        }
        Update: {
          attempts?: number
          business_id?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          provider_subscription_id?: string | null
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_webhook_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_subscriptions: {
        Row: {
          business_id: string
          cancel_at_period_end: boolean
          cancel_requested_at: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          ended_at: string | null
          id: string
          last_event_at: string | null
          owner_id: string
          plan_id: string
          provider: string
          provider_subscription_id: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_at_period_end?: boolean
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          last_event_at?: string | null
          owner_id: string
          plan_id: string
          provider: string
          provider_subscription_id: string
          status: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_at_period_end?: boolean
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          ended_at?: string | null
          id?: string
          last_event_at?: string | null
          owner_id?: string
          plan_id?: string
          provider?: string
          provider_subscription_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "business_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          feature_key: string
          monthly_limit: number
          plan_id: string
        }
        Insert: {
          feature_key: string
          monthly_limit: number
          plan_id: string
        }
        Update: {
          feature_key?: string
          monthly_limit?: number
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          description: string | null
          feature_key: string
          id: string
          owner_id: string
          period_start: string
          reference_id: string | null
          reference_type: string | null
          state: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          description?: string | null
          feature_key: string
          id?: string
          owner_id: string
          period_start: string
          reference_id?: string | null
          reference_type?: string | null
          state?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          description?: string | null
          feature_key?: string
          id?: string
          owner_id?: string
          period_start?: string
          reference_id?: string | null
          reference_type?: string | null
          state?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      businesses: {
        Row: {
          address_line: string | null
          brand_tagline: string | null
          business_category: string
          business_name: string
          country: string
          created_at: string
          description: string | null
          district: string | null
          email: string | null
          facebook_url: string | null
          google_business_url: string | null
          id: string
          instagram_url: string | null
          logo_url: string | null
          onboarding_completed_at: string | null
          opening_hours: string | null
          owner_id: string
          phone: string | null
          pincode: string | null
          state: string | null
          taluka: string | null
          updated_at: string
          village: string | null
          website_url: string | null
          whatsapp_number: string | null
          content_language: string | null
          tone: string | null
          target_customers: string | null
          preferred_cta: string | null
          promotional_style: string | null
          preferred_contact_method: string | null
        }
        Insert: {
          address_line?: string | null
          brand_tagline?: string | null
          business_category: string
          business_name: string
          country?: string
          created_at?: string
          description?: string | null
          district?: string | null
          email?: string | null
          facebook_url?: string | null
          google_business_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          onboarding_completed_at?: string | null
          opening_hours?: string | null
          owner_id?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          taluka?: string | null
          updated_at?: string
          village?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
          content_language?: string | null
          tone?: string | null
          target_customers?: string | null
          preferred_cta?: string | null
          promotional_style?: string | null
          preferred_contact_method?: string | null
        }
        Update: {
          address_line?: string | null
          brand_tagline?: string | null
          business_category?: string
          business_name?: string
          country?: string
          created_at?: string
          description?: string | null
          district?: string | null
          email?: string | null
          facebook_url?: string | null
          google_business_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          onboarding_completed_at?: string | null
          opening_hours?: string | null
          owner_id?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          taluka?: string | null
          updated_at?: string
          village?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
          content_language?: string | null
          tone?: string | null
          target_customers?: string | null
          preferred_cta?: string | null
          promotional_style?: string | null
          preferred_contact_method?: string | null
        }
        Relationships: []
      }
      content_items: {
        Row: {
          business_id: string
          call_to_action: string | null
          content_type: string
          created_at: string
          description: string | null
          id: string
          language: string
          notes: string | null
          offer_text: string | null
          owner_id: string
          price: string | null
          product_name: string | null
          scheduled_for: string | null
          search_text: string | null
          status: string
          storyboard: Json | null
          template_id: string | null
          title: string
          updated_at: string
          tone: string | null
          generated_copy: Json | null
          ai_provider: string | null
          ai_model: string | null
          ai_generated_at: string | null
        }
        Insert: {
          business_id: string
          call_to_action?: string | null
          content_type: string
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          notes?: string | null
          offer_text?: string | null
          owner_id?: string
          price?: string | null
          product_name?: string | null
          scheduled_for?: string | null
          search_text?: string | null
          status?: string
          storyboard?: Json | null
          template_id?: string | null
          title: string
          updated_at?: string
          tone?: string | null
          generated_copy?: Json | null
          ai_provider?: string | null
          ai_model?: string | null
          ai_generated_at?: string | null
        }
        Update: {
          business_id?: string
          call_to_action?: string | null
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          notes?: string | null
          offer_text?: string | null
          owner_id?: string
          price?: string | null
          product_name?: string | null
          scheduled_for?: string | null
          search_text?: string | null
          status?: string
          storyboard?: Json | null
          template_id?: string | null
          title?: string
          updated_at?: string
          tone?: string | null
          generated_copy?: Json | null
          ai_provider?: string | null
          ai_model?: string | null
          ai_generated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "content_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          business_categories: string[]
          content_type: string
          created_at: string
          default_cta: string | null
          description: string
          id: string
          is_active: boolean
          languages: string[]
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_categories?: string[]
          content_type: string
          created_at?: string
          default_cta?: string | null
          description: string
          id?: string
          is_active?: boolean
          languages?: string[]
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_categories?: string[]
          content_type?: string
          created_at?: string
          default_cta?: string | null
          description?: string
          id?: string
          is_active?: boolean
          languages?: string[]
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          asset_type: string
          business_id: string
          content_item_id: string | null
          created_at: string
          file_size: number | null
          height: number | null
          id: string
          metadata: Json
          mime_type: string | null
          model: string | null
          owner_id: string
          provider: string | null
          source_type: string
          status: string
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_type: string
          business_id: string
          content_item_id?: string | null
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          model?: string | null
          owner_id?: string
          provider?: string | null
          source_type: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          business_id?: string
          content_item_id?: string | null
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          model?: string | null
          owner_id?: string
          provider?: string | null
          source_type?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "media_assets_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          preferred_language: string
          product_update_emails: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
          product_update_emails?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
          product_update_emails?: boolean
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
      billing_commit_usage: { Args: { p_usage_id: string }; Returns: undefined }
      billing_mark_cancel_requested: { Args: { p_subscription_id: string }; Returns: undefined }
      billing_process_webhook: {
        Args: { p_body: string; p_event_id: string; p_provider: string; p_signature: string }
        Returns: Json
      }
      billing_release_usage: { Args: { p_usage_id: string }; Returns: undefined }
      billing_reserve_usage: {
        Args: { p_feature: string; p_reference_id?: string; p_reference_type?: string }
        Returns: string
      }
      billing_usage_summary: {
        Args: never
        Returns: {
          feature_key: string
          monthly_limit: number
          period_start: string
          remaining: number
          reserved: number
          used: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]

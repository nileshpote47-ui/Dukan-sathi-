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
          allowed_channels: string[]
          max_accounts_per_post: number
          max_connected_accounts: number | null
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
          allowed_channels?: string[]
          max_accounts_per_post?: number
          max_connected_accounts?: number | null
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
          allowed_channels?: string[]
          max_accounts_per_post?: number
          max_connected_accounts?: number | null
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
          voiceover: Json | null
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
          voiceover?: Json | null
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
          voiceover?: Json | null
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
      social_accounts: {
        Row: {
          business_id: string
          channel: string
          connected_at: string
          created_at: string
          external_account_id: string
          external_account_name: string | null
          external_parent_id: string | null
          id: string
          last_checked_at: string | null
          last_error_code: string | null
          metadata: Json
          owner_id: string
          provider: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          channel: string
          connected_at?: string
          created_at?: string
          external_account_id: string
          external_account_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          metadata?: Json
          owner_id: string
          provider: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          channel?: string
          connected_at?: string
          created_at?: string
          external_account_id?: string
          external_account_name?: string | null
          external_parent_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          metadata?: Json
          owner_id?: string
          provider?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      publishing_jobs: {
        Row: {
          attempt_count: number
          business_id: string
          cancelled_at: string | null
          caption: string
          channel: string
          content_item_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          external_post_id: string | null
          external_url: string | null
          id: string
          last_attempt_at: string | null
          media_asset_id: string | null
          metadata: Json
          next_attempt_at: string | null
          owner_id: string
          publish_mode: string
          published_at: string | null
          scheduled_for: string
          social_account_id: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
          usage_id: string | null
        }
        Insert: {
          attempt_count?: number
          business_id: string
          cancelled_at?: string | null
          caption?: string
          channel: string
          content_item_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          last_attempt_at?: string | null
          media_asset_id?: string | null
          metadata?: Json
          next_attempt_at?: string | null
          owner_id: string
          publish_mode: string
          published_at?: string | null
          scheduled_for?: string
          social_account_id?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          usage_id?: string | null
        }
        Update: {
          attempt_count?: number
          business_id?: string
          cancelled_at?: string | null
          caption?: string
          channel?: string
          content_item_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          last_attempt_at?: string | null
          media_asset_id?: string | null
          metadata?: Json
          next_attempt_at?: string | null
          owner_id?: string
          publish_mode?: string
          published_at?: string | null
          scheduled_for?: string
          social_account_id?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          usage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publishing_jobs_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "publishing_jobs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_jobs_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publishing_jobs_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_attempts: {
        Row: {
          attempt_no: number
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_id: string
          outcome: string
          owner_id: string
          provider_ref: string | null
          started_at: string
        }
        Insert: {
          attempt_no: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          outcome?: string
          owner_id: string
          provider_ref?: string | null
          started_at?: string
        }
        Update: {
          attempt_no?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          outcome?: string
          owner_id?: string
          provider_ref?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publishing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string | null
          opt_in_at: string
          opt_in_source: string
          opted_out_at: string | null
          opted_out_by: string | null
          owner_id: string
          phone_e164: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name?: string | null
          opt_in_at?: string
          opt_in_source: string
          opted_out_at?: string | null
          opted_out_by?: string | null
          owner_id?: string
          phone_e164: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string | null
          opt_in_at?: string
          opt_in_source?: string
          opted_out_at?: string | null
          opted_out_by?: string | null
          owner_id?: string
          phone_e164?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_business_owner_fkey"
            columns: ["business_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          contact_id: string | null
          created_at: string
          error_code: string | null
          id: string
          job_id: string
          owner_id: string
          status: string
          updated_at: string
          wamid: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          job_id: string
          owner_id: string
          status: string
          updated_at?: string
          wamid?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          job_id?: string
          owner_id?: string
          status?: string
          updated_at?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publishing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_metrics: {
        Row: {
          channel: string
          fetched_at: string
          job_id: string
          metrics: Json
          owner_id: string
          status: string
        }
        Insert: {
          channel: string
          fetched_at?: string
          job_id: string
          metrics?: Json
          owner_id: string
          status: string
        }
        Update: {
          channel?: string
          fetched_at?: string
          job_id?: string
          metrics?: Json
          owner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "publishing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_counters: {
        Row: { action: string; hits: number; user_id: string; window_start: string }
        Insert: { action: string; hits?: number; user_id: string; window_start: string }
        Update: { action?: string; hits?: number; user_id?: string; window_start?: string }
        Relationships: []
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
      admin_business_detail: { Args: { p_business_id: string }; Returns: Json }
      admin_is_admin: { Args: never; Returns: boolean }
      admin_list_businesses: {
        Args: { p_category: string | null; p_limit: number; p_offset: number; p_plan: string | null; p_search: string | null }
        Returns: Json
      }
      admin_list_users: { Args: { p_limit: number; p_offset: number; p_search: string | null }; Returns: Json }
      admin_overview: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_publishing: {
        Args: { p_channel: string | null; p_limit: number; p_offset: number; p_status: string | null }
        Returns: Json
      }
      admin_subscriptions: { Args: { p_limit: number; p_offset: number; p_status: string | null }; Returns: Json }
      admin_system: { Args: { p_hours: number }; Returns: Json }
      admin_usage: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_user_detail: { Args: { p_user_id: string }; Returns: Json }
      analytics_business_overview: { Args: { p_from: string; p_to: string }; Returns: Json }
      publishing_save_metrics: { Args: { p_rows: Json; p_secret: string }; Returns: number }
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
      publishing_begin_attempt: { Args: { p_job_id: string; p_secret: string }; Returns: Json }
      publishing_cancel_job: { Args: { p_job_id: string }; Returns: string | null }
      publishing_claim_due: { Args: { p_limit: number; p_secret: string }; Returns: string[] }
      publishing_complete_attempt: {
        Args: {
          p_account_status: string | null
          p_attempt_id: string
          p_error_code: string | null
          p_error_message: string | null
          p_external_id: string | null
          p_external_url: string | null
          p_messages: Json | null
          p_metadata: Json | null
          p_provider_ref: string | null
          p_retry_in_seconds: number | null
          p_secret: string
          p_success: boolean
        }
        Returns: string
      }
      publishing_connect_account: {
        Args: {
          p_channel: string
          p_ciphertext: string
          p_external_id: string
          p_metadata: Json
          p_name: string
          p_parent_id: string | null
          p_provider: string
          p_scopes: string[]
          p_secret: string
          p_token_expires_at: string | null
        }
        Returns: string
      }
      publishing_create_job: {
        Args: {
          p_account_id: string
          p_allow_repeat: boolean
          p_caption: string
          p_content_id: string
          p_media_asset_id: string | null
          p_media_path: string | null
          p_media_url: string | null
          p_metadata: Json
          p_payload: Json
          p_scheduled_for: string | null
          p_secret: string
        }
        Returns: string
      }
      publishing_disconnect_account: { Args: { p_account_id: string }; Returns: undefined }
      publishing_get_credentials: {
        Args: { p_account_id: string; p_secret: string }
        Returns: {
          channel: string
          ciphertext: string
          external_account_id: string
          external_parent_id: string | null
          metadata: Json
          provider: string
          status: string
          token_expires_at: string | null
        }[]
      }
      publishing_mark_account: {
        Args: { p_account_id: string; p_error_code: string | null; p_secret: string; p_status: string }
        Returns: undefined
      }
      publishing_process_whatsapp_webhook: {
        Args: { p_event_hash: string; p_optouts: Json; p_phone_number_id: string; p_secret: string; p_statuses: Json }
        Returns: string
      }
      publishing_retry_job: { Args: { p_job_id: string; p_media_url: string | null; p_secret: string }; Returns: undefined }
      publishing_revoke_provider_user: {
        Args: { p_provider: string; p_provider_user_id: string; p_secret: string }
        Returns: number
      }
      publishing_whatsapp_recipients: {
        Args: { p_job_id: string; p_secret: string }
        Returns: { contact_id: string; phone_e164: string }[]
      }
      publishing_update_credentials: {
        Args: { p_account_id: string; p_ciphertext: string; p_secret: string; p_token_expires_at: string | null }
        Returns: undefined
      }
      rate_limit_hit: {
        Args: { p_action: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
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

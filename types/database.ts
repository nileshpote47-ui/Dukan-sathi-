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
          template_id: string | null
          title: string
          updated_at: string
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
          template_id?: string | null
          title: string
          updated_at?: string
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
          template_id?: string | null
          title?: string
          updated_at?: string
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
      [_ in never]: never
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

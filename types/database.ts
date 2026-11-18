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
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          preferred_language?: string
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

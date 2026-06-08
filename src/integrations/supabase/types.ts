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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      difficulty_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          multiplier: number
          tag: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          multiplier?: number
          tag: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          multiplier?: number
          tag?: string
        }
        Relationships: []
      }
      form_rules: {
        Row: {
          base_make_minutes: number
          created_at: string
          default_packaging: string | null
          dosage_form: string
          id: string
          notes: string | null
          parsing_convention: string
          variable_minutes_per_unit: number
        }
        Insert: {
          base_make_minutes?: number
          created_at?: string
          default_packaging?: string | null
          dosage_form: string
          id?: string
          notes?: string | null
          parsing_convention: string
          variable_minutes_per_unit?: number
        }
        Update: {
          base_make_minutes?: number
          created_at?: string
          default_packaging?: string | null
          dosage_form?: string
          id?: string
          notes?: string | null
          parsing_convention?: string
          variable_minutes_per_unit?: number
        }
        Relationships: []
      }
      formulations: {
        Row: {
          bom: Json
          created_at: string
          default_make_minutes: number | null
          difficulty_tags: Json
          dosage_form: string | null
          id: string
          last_used_at: string | null
          name: string
          notes: string | null
          packaging: Json
          quantity: number | null
          quantity_unit: string | null
          source: string
          times_used: number
          updated_at: string
        }
        Insert: {
          bom?: Json
          created_at?: string
          default_make_minutes?: number | null
          difficulty_tags?: Json
          dosage_form?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          notes?: string | null
          packaging?: Json
          quantity?: number | null
          quantity_unit?: string | null
          source?: string
          times_used?: number
          updated_at?: string
        }
        Update: {
          bom?: Json
          created_at?: string
          default_make_minutes?: number | null
          difficulty_tags?: Json
          dosage_form?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          notes?: string | null
          packaging?: Json
          quantity?: number | null
          quantity_unit?: string | null
          source?: string
          times_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      ingredients_master: {
        Row: {
          canonical_unit: string | null
          created_at: string
          gst_divisor: number | null
          id: string
          ingredient: string
          manual_check: boolean
          match_key: string | null
          normalised_qty: number | null
          note: string | null
          pack_price: number | null
          pack_size: string | null
          status: string | null
          supplier: string | null
          supplier_code: string | null
          unit_cost_ex_gst: number | null
          unit_cost_listed: number | null
        }
        Insert: {
          canonical_unit?: string | null
          created_at?: string
          gst_divisor?: number | null
          id?: string
          ingredient: string
          manual_check?: boolean
          match_key?: string | null
          normalised_qty?: number | null
          note?: string | null
          pack_price?: number | null
          pack_size?: string | null
          status?: string | null
          supplier?: string | null
          supplier_code?: string | null
          unit_cost_ex_gst?: number | null
          unit_cost_listed?: number | null
        }
        Update: {
          canonical_unit?: string | null
          created_at?: string
          gst_divisor?: number | null
          id?: string
          ingredient?: string
          manual_check?: boolean
          match_key?: string | null
          normalised_qty?: number | null
          note?: string | null
          pack_price?: number | null
          pack_size?: string | null
          status?: string | null
          supplier?: string | null
          supplier_code?: string | null
          unit_cost_ex_gst?: number | null
          unit_cost_listed?: number | null
        }
        Relationships: []
      }
      packaging_catalogue: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          note: string | null
          unit_cost_ex_gst: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          note?: string | null
          unit_cost_ex_gst?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          unit_cost_ex_gst?: number
        }
        Relationships: []
      }
      price_history: {
        Row: {
          created_at: string
          description: string
          dispensed_date: string | null
          dosage_form: string | null
          id: string
          pos_item_description: string | null
          price: number
          quantity: number | null
          script_number: string | null
        }
        Insert: {
          created_at?: string
          description: string
          dispensed_date?: string | null
          dosage_form?: string | null
          id?: string
          pos_item_description?: string | null
          price: number
          quantity?: number | null
          script_number?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          dispensed_date?: string | null
          dosage_form?: string | null
          id?: string
          pos_item_description?: string | null
          price?: number
          quantity?: number | null
          script_number?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          breakdown: Json | null
          created_at: string
          dosage_form: string | null
          formulation: Json | null
          id: string
          notes: string | null
          overrides: Json | null
          prescription_text: string | null
          price_ex_gst: number | null
          price_inc_gst: number | null
          quantity: number | null
          status: string
          taxable: boolean
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string
          dosage_form?: string | null
          formulation?: Json | null
          id?: string
          notes?: string | null
          overrides?: Json | null
          prescription_text?: string | null
          price_ex_gst?: number | null
          price_inc_gst?: number | null
          quantity?: number | null
          status?: string
          taxable?: boolean
        }
        Update: {
          breakdown?: Json | null
          created_at?: string
          dosage_form?: string | null
          formulation?: Json | null
          id?: string
          notes?: string | null
          overrides?: Json | null
          prescription_text?: string | null
          price_ex_gst?: number | null
          price_inc_gst?: number | null
          quantity?: number | null
          status?: string
          taxable?: boolean
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
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
    Enums: {},
  },
} as const

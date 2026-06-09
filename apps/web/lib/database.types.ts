/**
 * Focused Supabase types for the web app — the subset of tables the creator
 * studio reads/writes. The full generated schema lives in
 * packages/db/supabase/types.ts (regen with `supabase gen types`). This file is
 * self-contained so the Vercel build (root dir = apps/web) needs no cross-package
 * import.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProjectStatus =
  | "DRAFT"
  | "PLANNING"
  | "GENERATING"
  | "RENDERING"
  | "PAUSED"
  | "READY"
  | "FAILED";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: "USER" | "ADMIN";
          tier: "FREE" | "CREATOR" | "STUDIO" | "ENTERPRISE";
          credits_ms: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { id: string; email: string; display_name?: string | null };
        Update: { display_name?: string | null; tier?: Database["public"]["Tables"]["users"]["Row"]["tier"] };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          prompt: string;
          target_seconds: number;
          aspect_ratio: string;
          model_id: string;
          status: ProjectStatus;
          progress: number;
          estimated_ms: number | null;
          spent_ms: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          prompt: string;
          target_seconds: number;
          aspect_ratio?: string;
          model_id?: string;
          status?: ProjectStatus;
          progress?: number;
          estimated_ms?: number | null;
        };
        Update: {
          status?: ProjectStatus;
          progress?: number;
          spent_ms?: number;
          error_message?: string | null;
        };
        Relationships: [];
      };
      films: {
        Row: {
          id: string;
          project_id: string;
          mp4_key: string;
          hls_key: string | null;
          poster_key: string | null;
          duration_sec: number;
          version: number;
          views: number;
          published_at: string | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          mp4_key: string;
          hls_key?: string | null;
          duration_sec: number;
        };
        Update: { views?: number; published_at?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { project_status: ProjectStatus };
    CompositeTypes: { [_ in never]: never };
  };
}

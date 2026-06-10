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

export type SceneStatus =
  | "PENDING"
  | "PROMPTING"
  | "GENERATING"
  | "AUDIO"
  | "QC"
  | "READY"
  | "FAILED";

export type ShotStatus =
  | "PENDING"
  | "QUEUED"
  | "GENERATING"
  | "UPLOADED"
  | "QC_PASS"
  | "QC_FAIL"
  | "READY"
  | "FAILED";

export type ProjectMode = "auto" | "storyboard" | "library";
export type ShotSource = "text" | "image";
export type LocationKind = "CITY" | "KINGDOM" | "BUILDING" | "ROOM" | "LANDSCAPE" | "INTERIOR" | "EXTERIOR";

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
          mode: ProjectMode;
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
          mode?: ProjectMode;
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
      scenes: {
        Row: {
          id: string;
          project_id: string;
          index: number;
          heading: string;
          summary: string;
          dialogue: string | null;
          narration: string | null;
          camera: string | null;
          mood: string | null;
          music: string | null;
          location_note: string | null;
          character_ref: string | null;
          world_ref: string | null;
          bridge: Json | null;
          state_patch: Json | null;
          depends_on: number[];
          continuity_score: number | null;
          subtitles: Json | null;
          status: SceneStatus;
          duration_sec: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          index: number;
          heading: string;
          summary: string;
          dialogue?: string | null;
          narration?: string | null;
          camera?: string | null;
          mood?: string | null;
          music?: string | null;
          location_note?: string | null;
          character_ref?: string | null;
          world_ref?: string | null;
          bridge?: Json | null;
          state_patch?: Json | null;
          depends_on?: number[];
          continuity_score?: number | null;
          subtitles?: Json | null;
          status?: SceneStatus;
          duration_sec?: number;
        };
        Update: {
          index?: number;
          heading?: string;
          summary?: string;
          dialogue?: string | null;
          narration?: string | null;
          camera?: string | null;
          mood?: string | null;
          music?: string | null;
          location_note?: string | null;
          character_ref?: string | null;
          world_ref?: string | null;
          bridge?: Json | null;
          state_patch?: Json | null;
          depends_on?: number[];
          continuity_score?: number | null;
          subtitles?: Json | null;
          status?: SceneStatus;
          duration_sec?: number;
        };
        Relationships: [];
      };
      world_objects: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string;
          category: string;
          reference_urls: string[];
        };
        Insert: {
          project_id: string;
          name: string;
          description: string;
          category?: string;
          reference_urls?: string[];
        };
        Update: { name?: string; description?: string; category?: string; reference_urls?: string[] };
        Relationships: [];
      };
      shots: {
        Row: {
          id: string;
          scene_id: string;
          index: number;
          prompt: string;
          model_id: string;
          source: ShotSource;
          seed_image_key: string | null;
          camera_type: string | null;
          camera_movement: string | null;
          reference_video_key: string | null;
          status: ShotStatus;
          video_key: string | null;
          thumbnail_key: string | null;
          duration_sec: number;
          gpu_ms: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          scene_id: string;
          index: number;
          prompt: string;
          model_id?: string;
          source?: ShotSource;
          seed_image_key?: string | null;
          camera_type?: string | null;
          camera_movement?: string | null;
          reference_video_key?: string | null;
          status?: ShotStatus;
          duration_sec?: number;
        };
        Update: {
          prompt?: string;
          source?: ShotSource;
          seed_image_key?: string | null;
          camera_type?: string | null;
          camera_movement?: string | null;
          reference_video_key?: string | null;
          status?: ShotStatus;
          video_key?: string | null;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          appearance: string;
          age: number | null;
          gender: string | null;
          ethnicity: string | null;
          personality: string | null;
          arc: string | null;
          reference_urls: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          name: string;
          appearance: string;
          age?: number | null;
          gender?: string | null;
          ethnicity?: string | null;
          personality?: string | null;
          arc?: string | null;
          reference_urls?: string[];
        };
        Update: {
          name?: string;
          appearance?: string;
          personality?: string | null;
          arc?: string | null;
          reference_urls?: string[];
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          kind: LocationKind;
          description: string;
          parent_id: string | null;
          reference_urls: string[];
          created_at: string;
        };
        Insert: {
          project_id: string;
          name: string;
          kind: LocationKind;
          description: string;
          parent_id?: string | null;
          reference_urls?: string[];
        };
        Update: {
          name?: string;
          kind?: LocationKind;
          description?: string;
          reference_urls?: string[];
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

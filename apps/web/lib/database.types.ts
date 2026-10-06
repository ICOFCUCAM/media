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
          tier: "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE";
          credits_ms: number;
          notify_on_finish: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id: string; email: string; display_name?: string | null };
        Update: { display_name?: string | null; tier?: Database["public"]["Tables"]["users"]["Row"]["tier"]; credits_ms?: number; notify_on_finish?: boolean };
        Relationships: [];
      };
      marketplace_waitlist: {
        Row: { user_id: string; catalogue: string; created_at: string };
        Insert: { user_id: string; catalogue: string };
        Update: never;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          prompt: string;
          target_seconds: number;
          resolution: string;
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
          resolution?: string;
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
      audio_tracks: {
        Row: {
          id: string;
          scene_id: string;
          kind: "MUSIC" | "VOICE" | "SFX";
          key: string;
          meta: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: { scene_id: string; kind: "MUSIC" | "VOICE" | "SFX"; key: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      team_invites: {
        Row: { id: string; owner_id: string; email: string; role: string; status: string; created_at: string };
        Insert: { owner_id: string; email: string; role?: string };
        Update: { status?: string; role?: string };
        Relationships: [];
      };
      brand_kits: {
        Row: { user_id: string; logo_key: string | null; primary_color: string; secondary_color: string; outro_text: string | null; updated_at: string };
        Insert: { user_id: string; logo_key?: string | null; primary_color?: string; secondary_color?: string; outro_text?: string | null };
        Update: { logo_key?: string | null; primary_color?: string; secondary_color?: string; outro_text?: string | null };
        Relationships: [];
      };
      usage_records: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          gpu_ms: number;
          kind: string;
          cost_usd: number | null;
          created_at: string;
        };
        Insert: { user_id: string; gpu_ms: number; kind: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      social_launches: {
        Row: {
          id: string;
          user_id: string;
          video_key: string;
          brief: string;
          status: string;
          kit: Record<string, { title: string; description: string; hashtags: string[] }> | null;
          results: Record<string, { status: string; url?: string; detail?: string }> | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; video_key: string; brief?: string };
        Update: { status?: string; brief?: string };
        Relationships: [];
      };
      avatar_videos: {
        Row: {
          id: string;
          user_id: string;
          voiceover_id: string | null;
          title: string;
          image_key: string;
          status: string;
          video_key: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; voiceover_id?: string | null; title?: string; image_key: string; quality?: string };
        Update: { status?: string };
        Relationships: [];
      };
      showcase: {
        Row: { id: string; project_id: string | null; title: string; tag: string; video_path: string; created_at: string };
        Insert: { project_id?: string | null; title: string; tag?: string; video_path: string };
        Update: { title?: string; tag?: string };
        Relationships: [];
      };
      voices: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          share_status: string;
          share_terms: string | null;
          sample_key: string | null;
          provider: string | null;
          provider_voice_id: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; name: string; sample_key?: string | null };
        Update: { name?: string; status?: string; share_status?: string; share_terms?: string | null };
        Relationships: [];
      };
      voiceovers: {
        Row: {
          id: string;
          user_id: string;
          voice_id: string | null;
          title: string;
          text: string;
          language: string;
          audio_key: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; voice_id?: string | null; title: string; text: string; language?: string };
        Update: { status?: string };
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
          locales: Record<string, { mp4?: string; voice?: string }> | null;
          mp4_4k_key: string | null;
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
    Functions: {
      grant_credits: {
        Args: { target_email: string; minutes: number };
        Returns: number;
      };
      admin_list_users: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          email: string;
          tier: string;
          credits_ms: number;
          role: string;
          created_at: string;
          projects: number;
        }[];
      };
    };
    Enums: { project_status: ProjectStatus };
    CompositeTypes: { [_ in never]: never };
  };
}

// Cineforge — Supabase generated types.
// Source of truth: the live `cineforge` project schema (packages/db/supabase/migrations).
// Regenerate with:  supabase gen types typescript --project-id trazlydqhfvvawcvfhpw > packages/db/supabase/types.ts
// (or via the Supabase MCP `generate_typescript_types`). Do not edit by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          hashed: string
          id: string
          label: string | null
          last_used: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hashed: string
          id?: string
          label?: string | null
          last_used?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hashed?: string
          id?: string
          label?: string | null
          last_used?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_tracks: {
        Row: {
          duration_ms: number | null
          gain_db: number
          id: string
          key: string
          kind: Database["public"]["Enums"]["audio_kind"]
          meta: Json | null
          scene_id: string
          start_ms: number
        }
        Insert: {
          duration_ms?: number | null
          gain_db?: number
          id?: string
          key: string
          kind: Database["public"]["Enums"]["audio_kind"]
          meta?: Json | null
          scene_id: string
          start_ms?: number
        }
        Update: {
          duration_ms?: number | null
          gain_db?: number
          id?: string
          key?: string
          kind?: Database["public"]["Enums"]["audio_kind"]
          meta?: Json | null
          scene_id?: string
          start_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "audio_tracks_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          age: number | null
          appearance: string
          arc: string | null
          created_at: string
          embedding: string | null
          ethnicity: string | null
          gender: string | null
          id: string
          lora_key: string | null
          lora_version: string | null
          name: string
          personality: string | null
          project_id: string
          reference_urls: string[]
          updated_at: string
          voice_profile: Json | null
        }
        Insert: {
          age?: number | null
          appearance: string
          arc?: string | null
          created_at?: string
          embedding?: string | null
          ethnicity?: string | null
          gender?: string | null
          id?: string
          lora_key?: string | null
          lora_version?: string | null
          name: string
          personality?: string | null
          project_id: string
          reference_urls?: string[]
          updated_at?: string
          voice_profile?: Json | null
        }
        Update: {
          age?: number | null
          appearance?: string
          arc?: string | null
          created_at?: string
          embedding?: string | null
          ethnicity?: string | null
          gender?: string | null
          id?: string
          lora_key?: string | null
          lora_version?: string | null
          name?: string
          personality?: string | null
          project_id?: string
          reference_urls?: string[]
          updated_at?: string
          voice_profile?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      continuity_states: {
        Row: {
          created_at: string
          id: string
          project_id: string
          scene_index: number
          state: Json
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          scene_index: number
          state: Json
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          scene_index?: number
          state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "continuity_states_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dialogue_lines: {
        Row: {
          audio_key: string | null
          character_id: string | null
          emotion: string | null
          id: string
          index: number
          scene_id: string
          start_ms: number | null
          text: string
        }
        Insert: {
          audio_key?: string | null
          character_id?: string | null
          emotion?: string | null
          id?: string
          index: number
          scene_id: string
          start_ms?: number | null
          text: string
        }
        Update: {
          audio_key?: string | null
          character_id?: string | null
          emotion?: string | null
          id?: string
          index?: number
          scene_id?: string
          start_ms?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "dialogue_lines_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dialogue_lines_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          created_at: string
          id: string
          number: number
          season_id: string
          synopsis: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          number: number
          season_id: string
          synopsis?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: number
          season_id?: string
          synopsis?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      films: {
        Row: {
          created_at: string
          duration_sec: number
          hls_key: string | null
          id: string
          mp4_key: string
          poster_key: string | null
          project_id: string
          published_at: string | null
          size_bytes: number | null
          subtitle_key: string | null
          version: number
          views: number
        }
        Insert: {
          created_at?: string
          duration_sec: number
          hls_key?: string | null
          id?: string
          mp4_key: string
          poster_key?: string | null
          project_id: string
          published_at?: string | null
          size_bytes?: number | null
          subtitle_key?: string | null
          version?: number
          views?: number
        }
        Update: {
          created_at?: string
          duration_sec?: number
          hls_key?: string | null
          id?: string
          mp4_key?: string
          poster_key?: string | null
          project_id?: string
          published_at?: string | null
          size_bytes?: number | null
          subtitle_key?: string | null
          version?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "films_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["location_kind"]
          name: string
          parent_id: string | null
          project_id: string
          reference_urls: string[]
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: Database["public"]["Enums"]["location_kind"]
          name: string
          parent_id?: string | null
          project_id: string
          reference_urls?: string[]
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["location_kind"]
          name?: string
          parent_id?: string | null
          project_id?: string
          reference_urls?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          aspect_ratio: string
          created_at: string
          error_message: string | null
          estimated_ms: number | null
          id: string
          mode: string
          model_id: string
          progress: number
          prompt: string
          spent_ms: number
          status: Database["public"]["Enums"]["project_status"]
          target_seconds: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          error_message?: string | null
          estimated_ms?: number | null
          id?: string
          mode?: string
          model_id?: string
          progress?: number
          prompt: string
          spent_ms?: number
          status?: Database["public"]["Enums"]["project_status"]
          target_seconds: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          error_message?: string | null
          estimated_ms?: number | null
          id?: string
          model_id?: string
          progress?: number
          prompt?: string
          spent_ms?: number
          status?: Database["public"]["Enums"]["project_status"]
          target_seconds?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: { from_id: string; id: string; kind: string; to_id: string }
        Insert: { from_id: string; id?: string; kind: string; to_id: string }
        Update: { from_id?: string; id?: string; kind?: string; to_id?: string }
        Relationships: [
          {
            foreignKeyName: "relationships_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          created_at: string
          id: string
          kind: string
          log: string | null
          output_key: string | null
          progress: number
          project_id: string
          status: Database["public"]["Enums"]["render_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          log?: string | null
          output_key?: string | null
          progress?: number
          project_id: string
          status?: Database["public"]["Enums"]["render_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          log?: string | null
          output_key?: string | null
          progress?: number
          project_id?: string
          status?: Database["public"]["Enums"]["render_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_characters: {
        Row: {
          character_id: string
          id: string
          scene_id: string
          wardrobe_id: string | null
        }
        Insert: {
          character_id: string
          id?: string
          scene_id: string
          wardrobe_id?: string | null
        }
        Update: {
          character_id?: string
          id?: string
          scene_id?: string
          wardrobe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_characters_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_characters_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_characters_wardrobe_id_fkey"
            columns: ["wardrobe_id"]
            isOneToOne: false
            referencedRelation: "wardrobes"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          camera: string | null
          created_at: string
          dialogue: string | null
          duration_sec: number
          episode_id: string | null
          heading: string
          id: string
          index: number
          location_id: string | null
          location_note: string | null
          mood: string | null
          music: string | null
          narration: string | null
          project_id: string
          status: Database["public"]["Enums"]["scene_status"]
          summary: string
          time_of_day: string | null
          updated_at: string
          weather: string | null
        }
        Insert: {
          camera?: string | null
          created_at?: string
          dialogue?: string | null
          duration_sec?: number
          episode_id?: string | null
          heading: string
          id?: string
          index: number
          location_id?: string | null
          location_note?: string | null
          mood?: string | null
          music?: string | null
          narration?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["scene_status"]
          summary: string
          time_of_day?: string | null
          updated_at?: string
          weather?: string | null
        }
        Update: {
          camera?: string | null
          created_at?: string
          dialogue?: string | null
          duration_sec?: number
          episode_id?: string | null
          heading?: string
          id?: string
          index?: number
          location_id?: string | null
          location_note?: string | null
          mood?: string | null
          music?: string | null
          narration?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["scene_status"]
          summary?: string
          time_of_day?: string | null
          updated_at?: string
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      screenplays: {
        Row: {
          acts: Json
          created_at: string
          genre: string | null
          id: string
          logline: string
          project_id: string
          raw: Json
          synopsis: string
          tone: string | null
        }
        Insert: {
          acts: Json
          created_at?: string
          genre?: string | null
          id?: string
          logline: string
          project_id: string
          raw: Json
          synopsis: string
          tone?: string | null
        }
        Update: {
          acts?: Json
          created_at?: string
          genre?: string | null
          id?: string
          logline?: string
          project_id?: string
          raw?: Json
          synopsis?: string
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screenplays_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          id: string
          number: number
          series_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          number: number
          series_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          number?: number
          series_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      series: {
        Row: {
          created_at: string
          id: string
          project_id: string
          synopsis: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          synopsis?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          synopsis?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          attempts: number
          cache_key: string | null
          camera_plan: Json | null
          created_at: string
          duration_sec: number
          gpu_ms: number | null
          id: string
          index: number
          model_id: string
          model_version: string | null
          negative_prompt: string | null
          prompt: string
          prompt_hash: string | null
          qc_score: number | null
          scene_id: string
          seed: number | null
          seed_image_key: string | null
          source: string
          status: Database["public"]["Enums"]["shot_status"]
          thumbnail_key: string | null
          updated_at: string
          video_key: string | null
        }
        Insert: {
          attempts?: number
          cache_key?: string | null
          camera_plan?: Json | null
          created_at?: string
          duration_sec?: number
          gpu_ms?: number | null
          id?: string
          index: number
          model_id?: string
          model_version?: string | null
          negative_prompt?: string | null
          prompt: string
          prompt_hash?: string | null
          qc_score?: number | null
          scene_id: string
          seed?: number | null
          seed_image_key?: string | null
          source?: string
          status?: Database["public"]["Enums"]["shot_status"]
          thumbnail_key?: string | null
          updated_at?: string
          video_key?: string | null
        }
        Update: {
          attempts?: number
          cache_key?: string | null
          camera_plan?: Json | null
          created_at?: string
          duration_sec?: number
          gpu_ms?: number | null
          id?: string
          index?: number
          model_id?: string
          model_version?: string | null
          negative_prompt?: string | null
          prompt?: string
          prompt_hash?: string | null
          qc_score?: number | null
          scene_id?: string
          seed?: number | null
          status?: Database["public"]["Enums"]["shot_status"]
          thumbnail_key?: string | null
          updated_at?: string
          video_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_events: {
        Row: {
          created_at: string
          episode_index: number | null
          id: string
          kind: string
          payload: Json | null
          project_id: string
          scene_index: number | null
          summary: string
        }
        Insert: {
          created_at?: string
          episode_index?: number | null
          id?: string
          kind: string
          payload?: Json | null
          project_id: string
          scene_index?: number | null
          summary: string
        }
        Update: {
          created_at?: string
          episode_index?: number | null
          id?: string
          kind?: string
          payload?: Json | null
          project_id?: string
          scene_index?: number | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          cost_usd: number
          created_at: string
          gpu_ms: number
          id: string
          kind: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          gpu_ms?: number
          id?: string
          kind: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          gpu_ms?: number
          id?: string
          kind?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          credits_ms: number
          display_name: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["role"]
          stripe_id: string | null
          tier: Database["public"]["Enums"]["tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_ms?: number
          display_name?: string | null
          email: string
          id: string
          role?: Database["public"]["Enums"]["role"]
          stripe_id?: string | null
          tier?: Database["public"]["Enums"]["tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_ms?: number
          display_name?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["role"]
          stripe_id?: string | null
          tier?: Database["public"]["Enums"]["tier"]
          updated_at?: string
        }
        Relationships: []
      }
      wardrobes: {
        Row: {
          character_id: string
          description: string
          id: string
          label: string
          valid_from_scene: number | null
          valid_to_scene: number | null
        }
        Insert: {
          character_id: string
          description: string
          id?: string
          label: string
          valid_from_scene?: number | null
          valid_to_scene?: number | null
        }
        Update: {
          character_id?: string
          description?: string
          id?: string
          label?: string
          valid_from_scene?: number | null
          valid_to_scene?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wardrobes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      world_objects: {
        Row: {
          category: string
          description: string
          id: string
          name: string
          project_id: string
          reference_urls: string[]
        }
        Insert: {
          category?: string
          description: string
          id?: string
          name: string
          project_id: string
          reference_urls?: string[]
        }
        Update: {
          category?: string
          description?: string
          id?: string
          name?: string
          project_id?: string
          reference_urls?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "world_objects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      owns_character: { Args: { c: string }; Returns: boolean }
      owns_project: { Args: { p: string }; Returns: boolean }
      owns_scene: { Args: { s: string }; Returns: boolean }
      owns_season: { Args: { se: string }; Returns: boolean }
      owns_series: { Args: { sr: string }; Returns: boolean }
    }
    Enums: {
      audio_kind: "VOICE" | "MUSIC" | "SFX" | "AMBIENCE"
      location_kind:
        | "CITY"
        | "KINGDOM"
        | "BUILDING"
        | "ROOM"
        | "LANDSCAPE"
        | "INTERIOR"
        | "EXTERIOR"
      project_status:
        | "DRAFT"
        | "PLANNING"
        | "GENERATING"
        | "RENDERING"
        | "PAUSED"
        | "READY"
        | "FAILED"
      render_status: "QUEUED" | "ASSEMBLING" | "TRANSCODING" | "DONE" | "FAILED"
      role: "USER" | "ADMIN"
      scene_status:
        | "PENDING"
        | "PROMPTING"
        | "GENERATING"
        | "AUDIO"
        | "QC"
        | "READY"
        | "FAILED"
      shot_status:
        | "PENDING"
        | "QUEUED"
        | "GENERATING"
        | "UPLOADED"
        | "QC_PASS"
        | "QC_FAIL"
        | "READY"
        | "FAILED"
      tier: "FREE" | "CREATOR" | "STUDIO" | "ENTERPRISE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

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
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
      avatar_videos: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          image_key: string
          quality: string
          status: string
          title: string
          updated_at: string
          user_id: string
          video_key: string | null
          voiceover_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          image_key: string
          quality?: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
          video_key?: string | null
          voiceover_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          image_key?: string
          quality?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          video_key?: string | null
          voiceover_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_videos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_videos_voiceover_id_fkey"
            columns: ["voiceover_id"]
            isOneToOne: false
            referencedRelation: "voiceovers"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          logo_key: string | null
          outro_text: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          logo_key?: string | null
          outro_text?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          logo_key?: string | null
          outro_text?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
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
          locales: Json | null
          mp4_4k_key: string | null
          mp4_key: string
          poster_key: string | null
          project_id: string
          publications: Json | null
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
          locales?: Json | null
          mp4_4k_key?: string | null
          mp4_key: string
          poster_key?: string | null
          project_id: string
          publications?: Json | null
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
          locales?: Json | null
          mp4_4k_key?: string | null
          mp4_key?: string
          poster_key?: string | null
          project_id?: string
          publications?: Json | null
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
      marketplace_waitlist: {
        Row: {
          catalogue: string
          created_at: string
          user_id: string
        }
        Insert: {
          catalogue: string
          created_at?: string
          user_id: string
        }
        Update: {
          catalogue?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          resolution: string
          spent_ms: number
          status: Database["public"]["Enums"]["project_status"]
          target_seconds: number
          title: string
          updated_at: string
          user_id: string
          locked_at: string | null
          locked_by: string | null
          pass_mode: string
          previs_started_at: string | null
          story_approved_at: string | null
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
          resolution?: string
          spent_ms?: number
          status?: Database["public"]["Enums"]["project_status"]
          target_seconds: number
          title: string
          updated_at?: string
          user_id: string
          locked_at?: string | null
          locked_by?: string | null
          pass_mode?: string
          previs_started_at?: string | null
          story_approved_at?: string | null
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          error_message?: string | null
          estimated_ms?: number | null
          id?: string
          mode?: string
          model_id?: string
          progress?: number
          prompt?: string
          resolution?: string
          spent_ms?: number
          status?: Database["public"]["Enums"]["project_status"]
          target_seconds?: number
          title?: string
          updated_at?: string
          user_id?: string
          locked_at?: string | null
          locked_by?: string | null
          pass_mode?: string
          previs_started_at?: string | null
          story_approved_at?: string | null
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
        Row: {
          from_id: string
          id: string
          kind: string
          to_id: string
        }
        Insert: {
          from_id: string
          id?: string
          kind: string
          to_id: string
        }
        Update: {
          from_id?: string
          id?: string
          kind?: string
          to_id?: string
        }
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
      runtime_deployments: {
        Row: {
          approved_image: string | null
          base_url: string
          created_at: string
          enforcement: string
          id: string
          manifest: Json | null
          model_id: string
          runpod_pod_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_image?: string | null
          base_url: string
          created_at?: string
          enforcement?: string
          id: string
          manifest?: Json | null
          model_id: string
          runpod_pod_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_image?: string | null
          base_url?: string
          created_at?: string
          enforcement?: string
          id?: string
          manifest?: Json | null
          model_id?: string
          runpod_pod_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      runtime_execution_grants: {
        Row: {
          authz_digest: string | null
          body_sha256: string | null
          completed_at: string | null
          deployment_id: string | null
          error_code: string | null
          expires_at: string | null
          gpu_ms: number | null
          id: string
          image_ref: string | null
          input_keys: string[]
          issued_at: string
          jti: string | null
          mode: string
          outcome: string
          output_bytes: number | null
          output_keys: string[]
          project_id: string | null
          scope: string
          shot_id: string | null
        }
        Insert: {
          authz_digest?: string | null
          body_sha256?: string | null
          completed_at?: string | null
          deployment_id?: string | null
          error_code?: string | null
          expires_at?: string | null
          gpu_ms?: number | null
          id: string
          image_ref?: string | null
          input_keys?: string[]
          issued_at?: string
          jti?: string | null
          mode: string
          outcome: string
          output_bytes?: number | null
          output_keys?: string[]
          project_id?: string | null
          scope: string
          shot_id?: string | null
        }
        Update: {
          authz_digest?: string | null
          body_sha256?: string | null
          completed_at?: string | null
          deployment_id?: string | null
          error_code?: string | null
          expires_at?: string | null
          gpu_ms?: number | null
          id?: string
          image_ref?: string | null
          input_keys?: string[]
          issued_at?: string
          jti?: string | null
          mode?: string
          outcome?: string
          output_bytes?: number | null
          output_keys?: string[]
          project_id?: string | null
          scope?: string
          shot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runtime_execution_grants_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "runtime_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_gateway_events: {
        Row: {
          actor: string
          code: string | null
          created_at: string
          deployment_id: string | null
          detail: Json
          grant_id: string | null
          id: string
          type: string
        }
        Insert: {
          actor: string
          code?: string | null
          created_at?: string
          deployment_id?: string | null
          detail?: Json
          grant_id?: string | null
          id?: string
          type: string
        }
        Update: {
          actor?: string
          code?: string | null
          created_at?: string
          deployment_id?: string | null
          detail?: Json
          grant_id?: string | null
          id?: string
          type?: string
        }
        Relationships: []
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
          bridge: Json | null
          camera: string | null
          character_ref: string | null
          continuity_score: number | null
          created_at: string
          depends_on: number[]
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
          state_patch: Json | null
          status: Database["public"]["Enums"]["scene_status"]
          subtitles: Json | null
          summary: string
          time_of_day: string | null
          updated_at: string
          weather: string | null
          world_ref: string | null
        }
        Insert: {
          bridge?: Json | null
          camera?: string | null
          character_ref?: string | null
          continuity_score?: number | null
          created_at?: string
          depends_on?: number[]
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
          state_patch?: Json | null
          status?: Database["public"]["Enums"]["scene_status"]
          subtitles?: Json | null
          summary: string
          time_of_day?: string | null
          updated_at?: string
          weather?: string | null
          world_ref?: string | null
        }
        Update: {
          bridge?: Json | null
          camera?: string | null
          character_ref?: string | null
          continuity_score?: number | null
          created_at?: string
          depends_on?: number[]
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
          state_patch?: Json | null
          status?: Database["public"]["Enums"]["scene_status"]
          subtitles?: Json | null
          summary?: string
          time_of_day?: string | null
          updated_at?: string
          weather?: string | null
          world_ref?: string | null
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
          camera_movement: string | null
          camera_plan: Json | null
          camera_type: string | null
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
          reference_video_key: string | null
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
          camera_movement?: string | null
          camera_plan?: Json | null
          camera_type?: string | null
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
          reference_video_key?: string | null
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
          camera_movement?: string | null
          camera_plan?: Json | null
          camera_type?: string | null
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
          reference_video_key?: string | null
          scene_id?: string
          seed?: number | null
          seed_image_key?: string | null
          source?: string
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
      showcase: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          tag: string
          title: string
          video_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          tag?: string
          title: string
          video_path: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          tag?: string
          title?: string
          video_path?: string
        }
        Relationships: []
      }
      social_launches: {
        Row: {
          brief: string
          created_at: string
          error_message: string | null
          id: string
          kit: Json | null
          results: Json | null
          status: string
          updated_at: string
          user_id: string
          video_key: string
        }
        Insert: {
          brief?: string
          created_at?: string
          error_message?: string | null
          id?: string
          kit?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          video_key: string
        }
        Update: {
          brief?: string
          created_at?: string
          error_message?: string | null
          id?: string
          kit?: Json | null
          results?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          video_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_launches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      team_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          owner_id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          owner_id: string
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          owner_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          notify_on_finish: boolean
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
          notify_on_finish?: boolean
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
          notify_on_finish?: boolean
          role?: Database["public"]["Enums"]["role"]
          stripe_id?: string | null
          tier?: Database["public"]["Enums"]["tier"]
          updated_at?: string
        }
        Relationships: []
      }
      voiceovers: {
        Row: {
          audio_key: string | null
          created_at: string
          error_message: string | null
          id: string
          language: string
          status: string
          text: string
          title: string
          updated_at: string
          user_id: string
          voice_id: string | null
        }
        Insert: {
          audio_key?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string
          status?: string
          text: string
          title: string
          updated_at?: string
          user_id: string
          voice_id?: string | null
        }
        Update: {
          audio_key?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string
          status?: string
          text?: string
          title?: string
          updated_at?: string
          user_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voiceovers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          consent_confirmed_at: string | null
          consent_type: string | null
          created_at: string
          error_message: string | null
          id: string
          language: string | null
          name: string
          provider: string | null
          provider_voice_id: string | null
          quality: Json | null
          sample_key: string | null
          share_status: string
          share_terms: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_confirmed_at?: string | null
          consent_type?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          name: string
          provider?: string | null
          provider_voice_id?: string | null
          quality?: Json | null
          sample_key?: string | null
          share_status?: string
          share_terms?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_confirmed_at?: string | null
          consent_type?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string | null
          name?: string
          provider?: string | null
          provider_voice_id?: string | null
          quality?: Json | null
          sample_key?: string | null
          share_status?: string
          share_terms?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          credits_ms: number
          email: string
          id: string
          projects: number
          role: string
          tier: string
        }[]
      }
      grant_credits: {
        Args: { minutes: number; target_email: string }
        Returns: number
      }
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
        | "REVIEW"
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
      tier: "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      audio_kind: ["VOICE", "MUSIC", "SFX", "AMBIENCE"],
      location_kind: [
        "CITY",
        "KINGDOM",
        "BUILDING",
        "ROOM",
        "LANDSCAPE",
        "INTERIOR",
        "EXTERIOR",
      ],
      project_status: [
        "DRAFT",
        "PLANNING",
        "GENERATING",
        "RENDERING",
        "PAUSED",
        "READY",
        "FAILED",
        "REVIEW",
      ],
      render_status: ["QUEUED", "ASSEMBLING", "TRANSCODING", "DONE", "FAILED"],
      role: ["USER", "ADMIN"],
      scene_status: [
        "PENDING",
        "PROMPTING",
        "GENERATING",
        "AUDIO",
        "QC",
        "READY",
        "FAILED",
      ],
      shot_status: [
        "PENDING",
        "QUEUED",
        "GENERATING",
        "UPLOADED",
        "QC_PASS",
        "QC_FAIL",
        "READY",
        "FAILED",
      ],
      tier: ["FREE", "CREATOR", "STUDIO", "AGENCY", "ENTERPRISE"],
    },
  },
} as const

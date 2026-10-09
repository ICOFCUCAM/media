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
      acceptance_runs: {
        Row: {
          brief: string
          checks: Json
          finished_at: string
          git_sha: string | null
          id: string
          master_key: string | null
          project_id: string | null
          started_at: string
          target_sec: number
          verdict: string
        }
        Insert: {
          brief: string
          checks: Json
          finished_at?: string
          git_sha?: string | null
          id?: string
          master_key?: string | null
          project_id?: string | null
          started_at: string
          target_sec: number
          verdict: string
        }
        Update: {
          brief?: string
          checks?: Json
          finished_at?: string
          git_sha?: string | null
          id?: string
          master_key?: string | null
          project_id?: string | null
          started_at?: string
          target_sec?: number
          verdict?: string
        }
        Relationships: []
      }
      ai_decisions: {
        Row: {
          attempt: number
          created_at: string
          error_code: string | null
          id: string
          input_sha256: string
          input_tokens: number | null
          issues: number
          latency_ms: number | null
          model: string | null
          outcome: string
          output_sha256: string | null
          output_tokens: number | null
          project_id: string | null
          prompt_id: string
          prompt_version: number
          provider: string | null
          schema_name: string
          summary: string | null
          task: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error_code?: string | null
          id?: string
          input_sha256: string
          input_tokens?: number | null
          issues?: number
          latency_ms?: number | null
          model?: string | null
          outcome: string
          output_sha256?: string | null
          output_tokens?: number | null
          project_id?: string | null
          prompt_id: string
          prompt_version: number
          provider?: string | null
          schema_name: string
          summary?: string | null
          task: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error_code?: string | null
          id?: string
          input_sha256?: string
          input_tokens?: number | null
          issues?: number
          latency_ms?: number | null
          model?: string | null
          outcome?: string
          output_sha256?: string | null
          output_tokens?: number | null
          project_id?: string | null
          prompt_id?: string
          prompt_version?: number
          provider?: string | null
          schema_name?: string
          summary?: string | null
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
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
      audio_events: {
        Row: {
          audio_generation_id: string | null
          created_at: string
          end_us: number
          fade_in_us: number
          fade_out_us: number
          gain_db: number
          id: string
          media_version_id: string | null
          start_us: number
          stem: string
          timeline_event_id: string | null
          timeline_version_id: string
        }
        Insert: {
          audio_generation_id?: string | null
          created_at?: string
          end_us: number
          fade_in_us?: number
          fade_out_us?: number
          gain_db?: number
          id?: string
          media_version_id?: string | null
          start_us: number
          stem: string
          timeline_event_id?: string | null
          timeline_version_id: string
        }
        Update: {
          audio_generation_id?: string | null
          created_at?: string
          end_us?: number
          fade_in_us?: number
          fade_out_us?: number
          gain_db?: number
          id?: string
          media_version_id?: string | null
          start_us?: number
          stem?: string
          timeline_event_id?: string | null
          timeline_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_events_audio_generation_id_fkey"
            columns: ["audio_generation_id"]
            isOneToOne: false
            referencedRelation: "audio_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_events_media_version_id_fkey"
            columns: ["media_version_id"]
            isOneToOne: false
            referencedRelation: "media_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_events_timeline_event_id_fkey"
            columns: ["timeline_event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_events_timeline_version_id_fkey"
            columns: ["timeline_version_id"]
            isOneToOne: false
            referencedRelation: "production_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_generations: {
        Row: {
          attempt: number
          classified_at: string | null
          created_at: string
          dialogue_line_id: string | null
          id: string
          kind: string
          language: string | null
          media_version_id: string | null
          meta: Json
          model_id: string | null
          outcome: string | null
          outcome_code: string | null
          policy: string | null
          project_id: string
          provider: string
          requested_end_us: number | null
          requested_start_us: number | null
          timing_report: Json | null
          voice_id: string | null
        }
        Insert: {
          attempt?: number
          classified_at?: string | null
          created_at?: string
          dialogue_line_id?: string | null
          id?: string
          kind: string
          language?: string | null
          media_version_id?: string | null
          meta?: Json
          model_id?: string | null
          outcome?: string | null
          outcome_code?: string | null
          policy?: string | null
          project_id: string
          provider: string
          requested_end_us?: number | null
          requested_start_us?: number | null
          timing_report?: Json | null
          voice_id?: string | null
        }
        Update: {
          attempt?: number
          classified_at?: string | null
          created_at?: string
          dialogue_line_id?: string | null
          id?: string
          kind?: string
          language?: string | null
          media_version_id?: string | null
          meta?: Json
          model_id?: string | null
          outcome?: string | null
          outcome_code?: string | null
          policy?: string | null
          project_id?: string
          provider?: string
          requested_end_us?: number | null
          requested_start_us?: number | null
          timing_report?: Json | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audio_generations_media_version_id_fkey"
            columns: ["media_version_id"]
            isOneToOne: false
            referencedRelation: "media_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      av_sync_issues: {
        Row: {
          at_us: number
          check: string
          confidence: number
          event_id: string | null
          expected: Json
          id: string
          measured: Json
          message: string
          report_id: string
          resolved_at: string | null
          scene_id: string | null
          severity: string
          shot_id: string | null
          span_us: number | null
          status: string
          waiver_reason: string | null
        }
        Insert: {
          at_us: number
          check: string
          confidence: number
          event_id?: string | null
          expected?: Json
          id?: string
          measured?: Json
          message: string
          report_id: string
          resolved_at?: string | null
          scene_id?: string | null
          severity: string
          shot_id?: string | null
          span_us?: number | null
          status?: string
          waiver_reason?: string | null
        }
        Update: {
          at_us?: number
          check?: string
          confidence?: number
          event_id?: string | null
          expected?: Json
          id?: string
          measured?: Json
          message?: string
          report_id?: string
          resolved_at?: string | null
          scene_id?: string | null
          severity?: string
          shot_id?: string | null
          span_us?: number | null
          status?: string
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "av_sync_issues_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "av_sync_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      av_sync_reports: {
        Row: {
          checks: string[]
          created_at: string
          id: string
          passed: boolean
          policy: string
          scope: Json
          timeline_version_id: string
          tool_versions: Json
        }
        Insert: {
          checks: string[]
          created_at?: string
          id?: string
          passed: boolean
          policy: string
          scope?: Json
          timeline_version_id: string
          tool_versions?: Json
        }
        Update: {
          checks?: string[]
          created_at?: string
          id?: string
          passed?: boolean
          policy?: string
          scope?: Json
          timeline_version_id?: string
          tool_versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "av_sync_reports_timeline_version_id_fkey"
            columns: ["timeline_version_id"]
            isOneToOne: false
            referencedRelation: "production_timelines"
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
      benchmark_runs: {
        Row: {
          cases: Json
          created_at: string
          git_sha: string | null
          id: string
          metrics: Json
          model: string | null
          prompt_id: string | null
          prompt_version: number | null
          provider: string | null
          score: number | null
          status: string
          suite: string
        }
        Insert: {
          cases?: Json
          created_at?: string
          git_sha?: string | null
          id?: string
          metrics?: Json
          model?: string | null
          prompt_id?: string | null
          prompt_version?: number | null
          provider?: string | null
          score?: number | null
          status: string
          suite: string
        }
        Update: {
          cases?: Json
          created_at?: string
          git_sha?: string | null
          id?: string
          metrics?: Json
          model?: string | null
          prompt_id?: string | null
          prompt_version?: number | null
          provider?: string | null
          score?: number | null
          status?: string
          suite?: string
        }
        Relationships: []
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
      canon_revisions: {
        Row: {
          actor: string | null
          affected_scenes: string[]
          affected_shots: Json
          change: Json
          created_at: string
          from_version: string
          id: string
          invalidated: number
          issues: Json
          kind: string
          outcome: string
          project_id: string
          to_version: string
        }
        Insert: {
          actor?: string | null
          affected_scenes?: string[]
          affected_shots?: Json
          change: Json
          created_at?: string
          from_version: string
          id?: string
          invalidated?: number
          issues?: Json
          kind: string
          outcome: string
          project_id: string
          to_version: string
        }
        Update: {
          actor?: string | null
          affected_scenes?: string[]
          affected_shots?: Json
          change?: Json
          created_at?: string
          from_version?: string
          id?: string
          invalidated?: number
          issues?: Json
          kind?: string
          outcome?: string
          project_id?: string
          to_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          age: number | null
          animation_style: string | null
          appearance: string
          arc: string | null
          clothing: string | null
          created_at: string
          design: Json | null
          embedding: string | null
          ethnicity: string | null
          eyes: string | null
          gender: string | null
          hair: string | null
          height_cm: number | null
          id: string
          lora_key: string | null
          lora_sha256: string | null
          lora_version: string | null
          name: string
          personality: string | null
          project_id: string
          reference_urls: string[]
          source_character_id: string | null
          updated_at: string
          voice_profile: Json | null
        }
        Insert: {
          age?: number | null
          animation_style?: string | null
          appearance: string
          arc?: string | null
          clothing?: string | null
          created_at?: string
          design?: Json | null
          embedding?: string | null
          ethnicity?: string | null
          eyes?: string | null
          gender?: string | null
          hair?: string | null
          height_cm?: number | null
          id?: string
          lora_key?: string | null
          lora_sha256?: string | null
          lora_version?: string | null
          name: string
          personality?: string | null
          project_id: string
          reference_urls?: string[]
          source_character_id?: string | null
          updated_at?: string
          voice_profile?: Json | null
        }
        Update: {
          age?: number | null
          animation_style?: string | null
          appearance?: string
          arc?: string | null
          clothing?: string | null
          created_at?: string
          design?: Json | null
          embedding?: string | null
          ethnicity?: string | null
          eyes?: string | null
          gender?: string | null
          hair?: string | null
          height_cm?: number | null
          id?: string
          lora_key?: string | null
          lora_sha256?: string | null
          lora_version?: string | null
          name?: string
          personality?: string | null
          project_id?: string
          reference_urls?: string[]
          source_character_id?: string | null
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
          {
            foreignKeyName: "characters_source_character_id_fkey"
            columns: ["source_character_id"]
            isOneToOne: false
            referencedRelation: "characters"
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
      director_messages: {
        Row: {
          author: string
          body: string
          created_at: string
          edit_request_id: string | null
          id: string
          project_id: string
          reply_to: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          edit_request_id?: string | null
          id?: string
          project_id: string
          reply_to?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          edit_request_id?: string | null
          id?: string
          project_id?: string
          reply_to?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "director_messages_edit_request_id_fkey"
            columns: ["edit_request_id"]
            isOneToOne: false
            referencedRelation: "edit_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "director_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          description: string
          effect: Json
          id: string
          op: Json
          position: number
          project_id: string
          review_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          description: string
          effect?: Json
          id?: string
          op: Json
          position: number
          project_id: string
          review_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          description?: string
          effect?: Json
          id?: string
          op?: Json
          position?: number
          project_id?: string
          review_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_proposals_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "editorial_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_requests: {
        Row: {
          affected_shots: number | null
          change: Json
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          issues: Json
          project_id: string
          requested_by: string | null
          status: string
          to_version: string | null
        }
        Insert: {
          affected_shots?: number | null
          change: Json
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          issues?: Json
          project_id: string
          requested_by?: string | null
          status?: string
          to_version?: string | null
        }
        Update: {
          affected_shots?: number | null
          change?: Json
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          issues?: Json
          project_id?: string
          requested_by?: string | null
          status?: string
          to_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edit_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_reviews: {
        Row: {
          applied_at: string | null
          applied_version: string | null
          canon_version: string | null
          created_at: string
          dropped: Json
          error: string | null
          findings: Json
          id: string
          instruction: string | null
          project_id: string
          requested_by: string | null
          reviewed_at: string | null
          status: string
          summary: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_version?: string | null
          canon_version?: string | null
          created_at?: string
          dropped?: Json
          error?: string | null
          findings?: Json
          id?: string
          instruction?: string | null
          project_id: string
          requested_by?: string | null
          reviewed_at?: string | null
          status?: string
          summary?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_version?: string | null
          canon_version?: string | null
          created_at?: string
          dropped?: Json
          error?: string | null
          findings?: Json
          id?: string
          instruction?: string | null
          project_id?: string
          requested_by?: string | null
          reviewed_at?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          created_at: string
          id: string
          number: number
          project_id: string | null
          season_id: string
          synopsis: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          number: number
          project_id?: string | null
          season_id: string
          synopsis?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: number
          project_id?: string | null
          season_id?: string
          synopsis?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
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
      media_versions: {
        Row: {
          asset_id: string
          asset_type: string
          created_at: string
          derivation: Json | null
          derived_from: string[]
          duration_us: number | null
          generation_ref: string | null
          id: string
          project_id: string
          sha256: string | null
          storage_key: string
          version: number
        }
        Insert: {
          asset_id: string
          asset_type: string
          created_at?: string
          derivation?: Json | null
          derived_from?: string[]
          duration_us?: number | null
          generation_ref?: string | null
          id?: string
          project_id: string
          sha256?: string | null
          storage_key: string
          version: number
        }
        Update: {
          asset_id?: string
          asset_type?: string
          created_at?: string
          derivation?: Json | null
          derived_from?: string[]
          duration_us?: number | null
          generation_ref?: string | null
          id?: string
          project_id?: string
          sha256?: string | null
          storage_key?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      production_degradations: {
        Row: {
          code: string
          created_at: string
          detail: Json | null
          id: string
          message: string
          project_id: string
          ref_id: string | null
          scope: string
          severity: string
        }
        Insert: {
          code: string
          created_at?: string
          detail?: Json | null
          id?: string
          message: string
          project_id: string
          ref_id?: string | null
          scope: string
          severity: string
        }
        Update: {
          code?: string
          created_at?: string
          detail?: Json | null
          id?: string
          message?: string
          project_id?: string
          ref_id?: string | null
          scope?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_degradations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      production_timelines: {
        Row: {
          approved_at: string | null
          created_at: string
          duration_us: number
          fps_den: number
          fps_num: number
          id: string
          parent_version_id: string | null
          project_id: string
          sample_rate: number
          status: string
          sync_policy_id: string
          sync_policy_version: number
          version: number
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          duration_us?: number
          fps_den: number
          fps_num: number
          id?: string
          parent_version_id?: string | null
          project_id: string
          sample_rate?: number
          status?: string
          sync_policy_id?: string
          sync_policy_version?: number
          version: number
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          duration_us?: number
          fps_den?: number
          fps_num?: number
          id?: string
          parent_version_id?: string | null
          project_id?: string
          sample_rate?: number
          status?: string
          sync_policy_id?: string
          sync_policy_version?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_timelines_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "production_timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_timelines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cast: {
        Row: {
          character_id: string
          created_at: string
          project_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          project_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cast_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cast_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          animation_style: string | null
          aspect_ratio: string
          created_at: string
          episode_number: number | null
          episodes: number | null
          error_message: string | null
          estimated_ms: number | null
          id: string
          kind: string
          locked_at: string | null
          locked_by: string | null
          medium: string
          mode: string
          model_id: string
          pass_mode: string
          previs_started_at: string | null
          progress: number
          prompt: string
          resolution: string
          series_id: string | null
          spent_ms: number
          status: Database["public"]["Enums"]["project_status"]
          story_approved_at: string | null
          target_seconds: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          animation_style?: string | null
          aspect_ratio?: string
          created_at?: string
          episode_number?: number | null
          episodes?: number | null
          error_message?: string | null
          estimated_ms?: number | null
          id?: string
          kind?: string
          locked_at?: string | null
          locked_by?: string | null
          medium?: string
          mode?: string
          model_id?: string
          pass_mode?: string
          previs_started_at?: string | null
          progress?: number
          prompt: string
          resolution?: string
          series_id?: string | null
          spent_ms?: number
          status?: Database["public"]["Enums"]["project_status"]
          story_approved_at?: string | null
          target_seconds: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          animation_style?: string | null
          aspect_ratio?: string
          created_at?: string
          episode_number?: number | null
          episodes?: number | null
          error_message?: string | null
          estimated_ms?: number | null
          id?: string
          kind?: string
          locked_at?: string | null
          locked_by?: string | null
          medium?: string
          mode?: string
          model_id?: string
          pass_mode?: string
          previs_started_at?: string | null
          progress?: number
          prompt?: string
          resolution?: string
          series_id?: string | null
          spent_ms?: number
          status?: Database["public"]["Enums"]["project_status"]
          story_approved_at?: string | null
          target_seconds?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_gate_results: {
        Row: {
          attempt: number
          created_at: string
          findings: Json
          gate: string
          id: string
          outcome: string
          project_id: string
          ref_id: string
          scope: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          findings?: Json
          gate: string
          id?: string
          outcome: string
          project_id: string
          ref_id: string
          scope: string
        }
        Update: {
          attempt?: number
          created_at?: string
          findings?: Json
          gate?: string
          id?: string
          outcome?: string
          project_id?: string
          ref_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_gate_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      repair_jobs: {
        Row: {
          action: Json
          attempt: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          issue_id: string
          result_media_version_id: string | null
          status: string
        }
        Insert: {
          action: Json
          attempt?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          issue_id: string
          result_media_version_id?: string | null
          status?: string
        }
        Update: {
          action?: Json
          attempt?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          issue_id?: string
          result_media_version_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_jobs_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "av_sync_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_result_media_version_id_fkey"
            columns: ["result_media_version_id"]
            isOneToOne: false
            referencedRelation: "media_versions"
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
      scene_versions: {
        Row: {
          canon_version: string | null
          created_at: string
          id: string
          project_id: string
          reason: string
          scene_id: string
          scene_index: number
          snapshot: Json
        }
        Insert: {
          canon_version?: string | null
          created_at?: string
          id?: string
          project_id: string
          reason: string
          scene_id: string
          scene_index: number
          snapshot: Json
        }
        Update: {
          canon_version?: string | null
          created_at?: string
          id?: string
          project_id?: string
          reason?: string
          scene_id?: string
          scene_index?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scene_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          locked_at: string | null
          locked_by: string | null
          mood: string | null
          music: string | null
          narration: string | null
          project_id: string
          state_patch: Json | null
          status: Database["public"]["Enums"]["scene_status"]
          storyboard_approved_at: string | null
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
          locked_at?: string | null
          locked_by?: string | null
          mood?: string | null
          music?: string | null
          narration?: string | null
          project_id: string
          state_patch?: Json | null
          status?: Database["public"]["Enums"]["scene_status"]
          storyboard_approved_at?: string | null
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
          locked_at?: string | null
          locked_by?: string | null
          mood?: string | null
          music?: string | null
          narration?: string | null
          project_id?: string
          state_patch?: Json | null
          status?: Database["public"]["Enums"]["scene_status"]
          storyboard_approved_at?: string | null
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
      shot_dependencies: {
        Row: {
          canon_version: string | null
          created_at: string
          entity_key: string
          entity_type: string
          id: string
          project_id: string
          shot_id: string
        }
        Insert: {
          canon_version?: string | null
          created_at?: string
          entity_key: string
          entity_type: string
          id?: string
          project_id: string
          shot_id: string
        }
        Update: {
          canon_version?: string | null
          created_at?: string
          entity_key?: string
          entity_type?: string
          id?: string
          project_id?: string
          shot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_dependencies_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
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
          cut_sec: number | null
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
          cut_sec?: number | null
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
          cut_sec?: number | null
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
      show_bibles: {
        Row: {
          audience: string | null
          continuity_rules: string | null
          episode_format: string | null
          genre: string | null
          locations: string | null
          music_identity: string | null
          narrative_rules: string | null
          series_id: string
          updated_at: string
          world_rules: string | null
        }
        Insert: {
          audience?: string | null
          continuity_rules?: string | null
          episode_format?: string | null
          genre?: string | null
          locations?: string | null
          music_identity?: string | null
          narrative_rules?: string | null
          series_id: string
          updated_at?: string
          world_rules?: string | null
        }
        Update: {
          audience?: string | null
          continuity_rules?: string | null
          episode_format?: string | null
          genre?: string | null
          locations?: string | null
          music_identity?: string | null
          narrative_rules?: string | null
          series_id?: string
          updated_at?: string
          world_rules?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_bibles_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: true
            referencedRelation: "series"
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
      stripe_events: {
        Row: {
          created_at: string
          credit_ms: number
          id: string
          tier: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credit_ms?: number
          id: string
          tier?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credit_ms?: number
          id?: string
          tier?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_policies: {
        Row: {
          calibrated: boolean
          created_at: string
          delivery: Json
          id: string
          repair: Json
          tolerances: Json
          version: number
        }
        Insert: {
          calibrated?: boolean
          created_at?: string
          delivery: Json
          id: string
          repair: Json
          tolerances: Json
          version: number
        }
        Update: {
          calibrated?: boolean
          created_at?: string
          delivery?: Json
          id?: string
          repair?: Json
          tolerances?: Json
          version?: number
        }
        Relationships: []
      }
      system_capabilities: {
        Row: {
          capability: string
          note: string | null
          provider: string | null
          real_execution: boolean
          reported_by: string
          requires_gpu: boolean
          status: string
          supports: string[]
          updated_at: string
        }
        Insert: {
          capability: string
          note?: string | null
          provider?: string | null
          real_execution: boolean
          reported_by: string
          requires_gpu?: boolean
          status: string
          supports?: string[]
          updated_at?: string
        }
        Update: {
          capability?: string
          note?: string | null
          provider?: string | null
          real_execution?: boolean
          reported_by?: string
          requires_gpu?: boolean
          status?: string
          supports?: string[]
          updated_at?: string
        }
        Relationships: []
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
      timeline_events: {
        Row: {
          anchor_event_id: string | null
          anchor_mode: string | null
          anchor_offset_us: number | null
          created_at: string
          end_us: number
          id: string
          kind: string
          parent_event_id: string | null
          payload: Json
          ref_id: string | null
          ref_type: string | null
          start_us: number
          timeline_version_id: string
        }
        Insert: {
          anchor_event_id?: string | null
          anchor_mode?: string | null
          anchor_offset_us?: number | null
          created_at?: string
          end_us: number
          id?: string
          kind: string
          parent_event_id?: string | null
          payload?: Json
          ref_id?: string | null
          ref_type?: string | null
          start_us: number
          timeline_version_id: string
        }
        Update: {
          anchor_event_id?: string | null
          anchor_mode?: string | null
          anchor_offset_us?: number | null
          created_at?: string
          end_us?: number
          id?: string
          kind?: string
          parent_event_id?: string | null
          payload?: Json
          ref_id?: string | null
          ref_type?: string | null
          start_us?: number
          timeline_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_anchor_event_id_fkey"
            columns: ["anchor_event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "timeline_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_timeline_version_id_fkey"
            columns: ["timeline_version_id"]
            isOneToOne: false
            referencedRelation: "production_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_records: {
        Row: {
          cost_usd: number
          created_at: string
          credit_ms: number
          gpu_ms: number
          id: string
          kind: string
          meta: Json
          model: string | null
          project_id: string | null
          provider: string | null
          unit: string | null
          units: number
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          credit_ms?: number
          gpu_ms?: number
          id?: string
          kind: string
          meta?: Json
          model?: string | null
          project_id?: string | null
          provider?: string | null
          unit?: string | null
          units?: number
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          credit_ms?: number
          gpu_ms?: number
          id?: string
          kind?: string
          meta?: Json
          model?: string | null
          project_id?: string | null
          provider?: string | null
          unit?: string | null
          units?: number
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
      video_generations: {
        Row: {
          actual_duration_us: number | null
          attempt: number
          classified_at: string | null
          created_at: string
          decision: Json | null
          gpu_ms: number | null
          grant_id: string | null
          graph_sha256: string | null
          id: string
          media_version_id: string | null
          model_id: string
          model_version: string | null
          outcome: string | null
          outcome_code: string | null
          policy: string | null
          project_id: string
          requested_duration_us: number
          requested_fps_den: number
          requested_fps_num: number
          runtime: string
          runtime_version: string | null
          shot_id: string | null
          timeline_version_id: string | null
          timing_constraints: Json
          timing_report: Json | null
          workflow_id: string
          workflow_version: number
        }
        Insert: {
          actual_duration_us?: number | null
          attempt?: number
          classified_at?: string | null
          created_at?: string
          decision?: Json | null
          gpu_ms?: number | null
          grant_id?: string | null
          graph_sha256?: string | null
          id?: string
          media_version_id?: string | null
          model_id: string
          model_version?: string | null
          outcome?: string | null
          outcome_code?: string | null
          policy?: string | null
          project_id: string
          requested_duration_us: number
          requested_fps_den?: number
          requested_fps_num: number
          runtime?: string
          runtime_version?: string | null
          shot_id?: string | null
          timeline_version_id?: string | null
          timing_constraints?: Json
          timing_report?: Json | null
          workflow_id?: string
          workflow_version?: number
        }
        Update: {
          actual_duration_us?: number | null
          attempt?: number
          classified_at?: string | null
          created_at?: string
          decision?: Json | null
          gpu_ms?: number | null
          grant_id?: string | null
          graph_sha256?: string | null
          id?: string
          media_version_id?: string | null
          model_id?: string
          model_version?: string | null
          outcome?: string | null
          outcome_code?: string | null
          policy?: string | null
          project_id?: string
          requested_duration_us?: number
          requested_fps_den?: number
          requested_fps_num?: number
          runtime?: string
          runtime_version?: string | null
          shot_id?: string | null
          timeline_version_id?: string | null
          timing_constraints?: Json
          timing_report?: Json | null
          workflow_id?: string
          workflow_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_generations_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "runtime_execution_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generations_media_version_id_fkey"
            columns: ["media_version_id"]
            isOneToOne: false
            referencedRelation: "media_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generations_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generations_timeline_version_id_fkey"
            columns: ["timeline_version_id"]
            isOneToOne: false
            referencedRelation: "production_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_engine_artifacts: {
        Row: {
          artifact_type: string
          artifact_uri: string
          created_at: string
          engine_id: string
          engine_version: string
          id: string
          metadata: Json
          voice_id: string
        }
        Insert: {
          artifact_type: string
          artifact_uri: string
          created_at?: string
          engine_id: string
          engine_version: string
          id?: string
          metadata?: Json
          voice_id: string
        }
        Update: {
          artifact_type?: string
          artifact_uri?: string
          created_at?: string
          engine_id?: string
          engine_version?: string
          id?: string
          metadata?: Json
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_engine_artifacts_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          engine: string | null
          error: string | null
          id: string
          payload: Json
          result: Json | null
          started_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
          voice_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          engine?: string | null
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
          voice_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          engine?: string | null
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_jobs_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
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
      wardrobe_references: {
        Row: {
          character_id: string
          created_at: string
          digest: string
          id: string
          project_id: string
          provider: string
          storage_key: string
          wardrobe_key: string
        }
        Insert: {
          character_id: string
          created_at?: string
          digest: string
          id?: string
          project_id: string
          provider: string
          storage_key: string
          wardrobe_key: string
        }
        Update: {
          character_id?: string
          created_at?: string
          digest?: string
          id?: string
          project_id?: string
          provider?: string
          storage_key?: string
          wardrobe_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_references_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wardrobe_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      apply_stripe_grant: {
        Args: {
          p_credit_ms: number
          p_event_id: string
          p_stripe_id?: string
          p_tier?: string
          p_type: string
          p_user: string
        }
        Returns: boolean
      }
      clock_frame_at: {
        Args: { fps_den: number; fps_num: number; us: number }
        Returns: number
      }
      clock_frame_start: {
        Args: { fps_den: number; fps_num: number; n: number }
        Returns: number
      }
      clock_is_frame_aligned: {
        Args: { fps_den: number; fps_num: number; us: number }
        Returns: boolean
      }
      clock_is_sample_aligned: {
        Args: { sample_rate: number; us: number }
        Returns: boolean
      }
      clock_sample_start: {
        Args: { k: number; sample_rate: number }
        Returns: number
      }
      decide_edit_proposal: {
        Args: { p_approve: boolean; p_id: string }
        Returns: string
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
      request_editorial_apply: { Args: { p_review: string }; Returns: string }
      scene_is_locked: { Args: { s: string }; Returns: boolean }
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

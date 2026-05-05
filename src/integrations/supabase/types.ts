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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          metadata: Json
          summary: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          summary?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          summary?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      ai_agent_runs: {
        Row: {
          agent_name: string
          completed_at: string | null
          error: string | null
          id: string
          input_tokens: number | null
          inquiry_id: string
          latency_ms: number | null
          model: string | null
          output: string | null
          output_tokens: number | null
          prompt_version: string | null
          started_at: string | null
          status: string
          tool_calls: Json
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          inquiry_id: string
          latency_ms?: number | null
          model?: string | null
          output?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          started_at?: string | null
          status: string
          tool_calls?: Json
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          inquiry_id?: string
          latency_ms?: number | null
          model?: string | null
          output?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          started_at?: string | null
          status?: string
          tool_calls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          duration_minutes: number
          external_event_id: string | null
          external_event_provider: string | null
          external_synced_at: string | null
          host_id: string
          id: string
          inquiry_id: string | null
          kind: string
          location: string | null
          meeting_provider: string | null
          meeting_url: string | null
          notes: string | null
          proposed_by: string
          scheduled_at: string
          status: string
          title: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          external_event_id?: string | null
          external_event_provider?: string | null
          external_synced_at?: string | null
          host_id: string
          id?: string
          inquiry_id?: string | null
          kind?: string
          location?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          notes?: string | null
          proposed_by: string
          scheduled_at: string
          status?: string
          title?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          external_event_id?: string | null
          external_event_provider?: string | null
          external_synced_at?: string | null
          host_id?: string
          id?: string
          inquiry_id?: string | null
          kind?: string
          location?: string | null
          meeting_provider?: string | null
          meeting_url?: string | null
          notes?: string | null
          proposed_by?: string
          scheduled_at?: string
          status?: string
          title?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_bundles: {
        Row: {
          article_ids: string[] | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          published_at: string | null
          slug: string
          title: string
        }
        Insert: {
          article_ids?: string[] | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          published_at?: string | null
          slug: string
          title: string
        }
        Update: {
          article_ids?: string[] | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          title?: string
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          amount_cents: number
          category: string | null
          created_at: string
          description: string
          due_date: string | null
          host_id: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_cents: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          host_id: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_cents?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          host_id?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_cents?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token: string
          account_email: string | null
          created_at: string
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          primary_calendar_id: string
          provider: string
          pull_busy_times: boolean
          push_appointments: boolean
          refresh_token: string | null
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_email?: string | null
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          primary_calendar_id?: string
          provider: string
          pull_busy_times?: boolean
          push_appointments?: boolean
          refresh_token?: string | null
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_email?: string | null
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          primary_calendar_id?: string
          provider?: string
          pull_busy_times?: boolean
          push_appointments?: boolean
          refresh_token?: string | null
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_synced_busy: {
        Row: {
          ends_at: string
          external_event_id: string
          id: string
          is_all_day: boolean
          provider: string
          starts_at: string
          summary: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          ends_at: string
          external_event_id: string
          id?: string
          is_all_day?: boolean
          provider: string
          starts_at: string
          summary?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          ends_at?: string
          external_event_id?: string
          id?: string
          is_all_day?: boolean
          provider?: string
          starts_at?: string
          summary?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          category: string | null
          completed: boolean
          created_at: string
          display_order: number
          host_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          completed?: boolean
          created_at?: string
          display_order?: number
          host_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          completed?: boolean
          created_at?: string
          display_order?: number
          host_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          body: string
          contact_info_flagged: boolean
          created_at: string
          id: string
          sender_id: string
          sender_role: string
          thread_id: string
        }
        Insert: {
          body: string
          contact_info_flagged?: boolean
          created_at?: string
          id?: string
          sender_id: string
          sender_role: string
          thread_id: string
        }
        Update: {
          body?: string
          contact_info_flagged?: boolean
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "direct_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_threads: {
        Row: {
          created_at: string
          host_id: string
          id: string
          inquiry_id: string | null
          last_message_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          inquiry_id?: string | null
          last_message_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          inquiry_id?: string | null
          last_message_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_threads_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_threads_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_articles: {
        Row: {
          author_name: string | null
          body_md: string | null
          category: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          published_at: string | null
          slug: string
          subtitle: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          body_md?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          slug: string
          subtitle?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          body_md?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          slug?: string
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json
          occurred_at: string
          recipient_email: string | null
          resend_email_id: string | null
          resend_event_id: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json
          occurred_at: string
          recipient_email?: string | null
          resend_email_id?: string | null
          resend_event_id?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json
          occurred_at?: string
          recipient_email?: string | null
          resend_email_id?: string | null
          resend_event_id?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      event_album_photos: {
        Row: {
          album_id: string
          caption: string | null
          created_at: string
          display_order: number
          id: string
          storage_path: string
          taken_at: string | null
        }
        Insert: {
          album_id: string
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          storage_path: string
          taken_at?: string | null
        }
        Update: {
          album_id?: string
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          storage_path?: string
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_album_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "event_albums"
            referencedColumns: ["id"]
          },
        ]
      }
      event_albums: {
        Row: {
          cover_path: string | null
          created_at: string
          description: string | null
          download_enabled: boolean
          event_id: string | null
          host_consent_given_at: string | null
          host_id: string | null
          id: string
          inquiry_id: string | null
          published_at: string | null
          share_token: string
          title: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          description?: string | null
          download_enabled?: boolean
          event_id?: string | null
          host_consent_given_at?: string | null
          host_id?: string | null
          id?: string
          inquiry_id?: string | null
          published_at?: string | null
          share_token?: string
          title: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          description?: string | null
          download_enabled?: boolean
          event_id?: string | null
          host_consent_given_at?: string | null
          host_id?: string | null
          id?: string
          inquiry_id?: string | null
          published_at?: string | null
          share_token?: string
          title?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: []
      }
      event_guests: {
        Row: {
          created_at: string
          email: string | null
          group_label: string | null
          host_id: string
          id: string
          invitation_token: string
          is_vip: boolean
          name: string
          phone: string | null
          plus_one_allowed: boolean
          rsvp_dietary: string | null
          rsvp_message: string | null
          rsvp_plus_one: boolean | null
          rsvp_responded_at: string | null
          rsvp_status: string | null
          seat_index: number | null
          table_id: string | null
          updated_at: string
          vip_role: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          group_label?: string | null
          host_id: string
          id?: string
          invitation_token?: string
          is_vip?: boolean
          name: string
          phone?: string | null
          plus_one_allowed?: boolean
          rsvp_dietary?: string | null
          rsvp_message?: string | null
          rsvp_plus_one?: boolean | null
          rsvp_responded_at?: string | null
          rsvp_status?: string | null
          seat_index?: number | null
          table_id?: string | null
          updated_at?: string
          vip_role?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          group_label?: string | null
          host_id?: string
          id?: string
          invitation_token?: string
          is_vip?: boolean
          name?: string
          phone?: string | null
          plus_one_allowed?: boolean
          rsvp_dietary?: string | null
          rsvp_message?: string | null
          rsvp_plus_one?: boolean | null
          rsvp_responded_at?: string | null
          rsvp_status?: string | null
          seat_index?: number | null
          table_id?: string | null
          updated_at?: string
          vip_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "event_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      event_microsite_photos: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          event_id: string
          id: string
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_microsite_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "host_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_party_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          event_id: string
          host_id: string
          id: string
          member_user_id: string | null
          role_label: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          event_id: string
          host_id: string
          id?: string
          member_user_id?: string | null
          role_label?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          event_id?: string
          host_id?: string
          id?: string
          member_user_id?: string | null
          role_label?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_party_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "host_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_party_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          display_order: number
          due_date: string | null
          event_id: string
          id: string
          invite_id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          display_order?: number
          due_date?: string | null
          event_id: string
          id?: string
          invite_id: string
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          display_order?: number
          due_date?: string | null
          event_id?: string
          id?: string
          invite_id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_party_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "host_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_party_tasks_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "event_party_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registry_links: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          host_id: string
          id: string
          label: string
          provider: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          host_id: string
          id?: string
          label: string
          provider: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          host_id?: string
          id?: string
          label?: string
          provider?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registry_links_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tables: {
        Row: {
          capacity: number
          created_at: string
          display_order: number
          host_id: string
          id: string
          name: string
          notes: string | null
          shape: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          display_order?: number
          host_id: string
          id?: string
          name: string
          notes?: string | null
          shape?: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          display_order?: number
          host_id?: string
          id?: string
          name?: string
          notes?: string | null
          shape?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tables_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          category: string | null
          created_at: string
          due_date: string | null
          host_id: string
          id: string
          notes: string | null
          priority: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          due_date?: string | null
          host_id: string
          id?: string
          notes?: string | null
          priority?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          due_date?: string | null
          host_id?: string
          id?: string
          notes?: string | null
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_timeline_items: {
        Row: {
          created_at: string
          display_order: number
          duration_minutes: number | null
          event_id: string | null
          host_id: string
          id: string
          location: string | null
          notes: string | null
          owner_label: string | null
          start_time: string
          title: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_minutes?: number | null
          event_id?: string | null
          host_id: string
          id?: string
          location?: string | null
          notes?: string | null
          owner_label?: string | null
          start_time: string
          title: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_minutes?: number | null
          event_id?: string | null
          host_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          owner_label?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_timeline_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "host_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_timeline_items_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_timeline_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_events: {
        Row: {
          body: string | null
          created_at: string
          date_label: string | null
          event_type: string
          event_type_label: string | null
          excerpt: string | null
          guests: number | null
          hero_url: string | null
          hosts: string | null
          id: string
          location: string | null
          published_at: string | null
          slug: string
          title: string
          updated_at: string
          vendor_credits: Json
        }
        Insert: {
          body?: string | null
          created_at?: string
          date_label?: string | null
          event_type: string
          event_type_label?: string | null
          excerpt?: string | null
          guests?: number | null
          hero_url?: string | null
          hosts?: string | null
          id?: string
          location?: string | null
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
          vendor_credits?: Json
        }
        Update: {
          body?: string | null
          created_at?: string
          date_label?: string | null
          event_type?: string
          event_type_label?: string | null
          excerpt?: string | null
          guests?: number | null
          hero_url?: string | null
          hosts?: string | null
          id?: string
          location?: string | null
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
          vendor_credits?: Json
        }
        Relationships: []
      }
      gift_pledges: {
        Row: {
          amount_cents: number
          contributor_email: string | null
          contributor_name: string
          created_at: string
          id: string
          message: string | null
          wish_id: string
        }
        Insert: {
          amount_cents: number
          contributor_email?: string | null
          contributor_name: string
          created_at?: string
          id?: string
          message?: string | null
          wish_id: string
        }
        Update: {
          amount_cents?: number
          contributor_email?: string | null
          contributor_name?: string
          created_at?: string
          id?: string
          message?: string | null
          wish_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_pledges_wish_id_fkey"
            columns: ["wish_id"]
            isOneToOne: false
            referencedRelation: "gift_wishes"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_wishes: {
        Row: {
          created_at: string
          description: string | null
          host_id: string
          id: string
          image_url: string | null
          share_token: string
          source_url: string | null
          target_cents: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          host_id: string
          id?: string
          image_url?: string | null
          share_token?: string
          source_url?: string | null
          target_cents?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          host_id?: string
          id?: string
          image_url?: string | null
          share_token?: string
          source_url?: string | null
          target_cents?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_wishes_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_channel_members: {
        Row: {
          channel_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "group_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      group_channels: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_private: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_private?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_private?: boolean
          name?: string
        }
        Relationships: []
      }
      guest_message_blasts: {
        Row: {
          audience: Json
          body: string
          host_id: string
          id: string
          sent_at: string
          sent_to_count: number
          subject: string
        }
        Insert: {
          audience?: Json
          body: string
          host_id: string
          id?: string
          sent_at?: string
          sent_to_count?: number
          subject: string
        }
        Update: {
          audience?: Json
          body?: string
          host_id?: string
          id?: string
          sent_at?: string
          sent_to_count?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_message_blasts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_events: {
        Row: {
          archived_at: string | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          created_at: string
          event_date: string | null
          event_location: string | null
          event_notes: string | null
          event_type: string
          host_id: string
          id: string
          microsite_cover_path: string | null
          microsite_published_at: string | null
          microsite_rsvp_deadline: string | null
          microsite_rsvp_questions: Json | null
          microsite_show_gallery: boolean
          microsite_show_gifts: boolean
          microsite_show_registry: boolean
          microsite_show_rsvp: boolean
          microsite_show_schedule: boolean
          microsite_story: string | null
          microsite_subtitle: string | null
          microsite_theme: string
          microsite_title: string | null
          microsite_token: string | null
          name: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          event_date?: string | null
          event_location?: string | null
          event_notes?: string | null
          event_type: string
          host_id: string
          id?: string
          microsite_cover_path?: string | null
          microsite_published_at?: string | null
          microsite_rsvp_deadline?: string | null
          microsite_rsvp_questions?: Json | null
          microsite_show_gallery?: boolean
          microsite_show_gifts?: boolean
          microsite_show_registry?: boolean
          microsite_show_rsvp?: boolean
          microsite_show_schedule?: boolean
          microsite_story?: string | null
          microsite_subtitle?: string | null
          microsite_theme?: string
          microsite_title?: string | null
          microsite_token?: string | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          event_date?: string | null
          event_location?: string | null
          event_notes?: string | null
          event_type?: string
          host_id?: string
          id?: string
          microsite_cover_path?: string | null
          microsite_published_at?: string | null
          microsite_rsvp_deadline?: string | null
          microsite_rsvp_questions?: Json | null
          microsite_show_gallery?: boolean
          microsite_show_gifts?: boolean
          microsite_show_registry?: boolean
          microsite_show_rsvp?: boolean
          microsite_show_schedule?: boolean
          microsite_story?: string | null
          microsite_subtitle?: string | null
          microsite_theme?: string
          microsite_title?: string | null
          microsite_token?: string | null
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_inquiry_templates: {
        Row: {
          body: string
          created_at: string
          event_type: string | null
          host_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          event_type?: string | null
          host_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          event_type?: string | null
          host_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      host_reliability_flags: {
        Row: {
          created_at: string
          flag_type: string
          host_id: string
          id: string
          inquiry_id: string | null
          note: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          flag_type: string
          host_id: string
          id?: string
          inquiry_id?: string | null
          note?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          flag_type?: string
          host_id?: string
          id?: string
          inquiry_id?: string | null
          note?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_reliability_flags_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_reliability_flags_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_reliability_flags_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          rating: number
          reviewed_at: string | null
          reviewer_name: string
          source: string
          vendor_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewed_at?: string | null
          reviewer_name: string
          source: string
          vendor_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewed_at?: string | null
          reviewer_name?: string
          source?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          budget_max_cents: number | null
          budget_min_cents: number | null
          created_at: string
          event_date: string | null
          event_type: string
          guest_count: number | null
          host_id: string
          id: string
          intake_answers: Json | null
          intent_score: number | null
          location: string | null
          quality_score: number | null
          recommended_verification: string | null
          review_prompt_sent_at: string | null
          special_requests: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          event_date?: string | null
          event_type: string
          guest_count?: number | null
          host_id: string
          id?: string
          intake_answers?: Json | null
          intent_score?: number | null
          location?: string | null
          quality_score?: number | null
          recommended_verification?: string | null
          review_prompt_sent_at?: string | null
          special_requests?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          created_at?: string
          event_date?: string | null
          event_type?: string
          guest_count?: number | null
          host_id?: string
          id?: string
          intake_answers?: Json | null
          intent_score?: number | null
          location?: string | null
          quality_score?: number | null
          recommended_verification?: string | null
          review_prompt_sent_at?: string | null
          special_requests?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_label_assignments: {
        Row: {
          created_at: string
          id: string
          inquiry_id: string
          label_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inquiry_id: string
          label_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inquiry_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_label_assignments_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiry_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "vendor_inquiry_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_metadata: Json | null
          attachment_paths: string[] | null
          attachments: Json
          body: string
          created_at: string
          draft_status: string | null
          id: string
          inquiry_id: string
          is_draft: boolean
          sender_id: string | null
          sender_role: string
          sent_at: string | null
        }
        Insert: {
          attachment_metadata?: Json | null
          attachment_paths?: string[] | null
          attachments?: Json
          body: string
          created_at?: string
          draft_status?: string | null
          id?: string
          inquiry_id: string
          is_draft?: boolean
          sender_id?: string | null
          sender_role: string
          sent_at?: string | null
        }
        Update: {
          attachment_metadata?: Json | null
          attachment_paths?: string[] | null
          attachments?: Json
          body?: string
          created_at?: string
          draft_status?: string | null
          id?: string
          inquiry_id?: string
          is_draft?: boolean
          sender_id?: string | null
          sender_role?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      microsite_rsvps: {
        Row: {
          answers: Json | null
          created_at: string
          dietary: string | null
          event_id: string
          guest_email: string | null
          guest_name: string
          id: string
          party_size: number
          status: string
        }
        Insert: {
          answers?: Json | null
          created_at?: string
          dietary?: string | null
          event_id: string
          guest_email?: string | null
          guest_name: string
          id?: string
          party_size?: number
          status: string
        }
        Update: {
          answers?: Json | null
          created_at?: string
          dietary?: string | null
          event_id?: string
          guest_email?: string | null
          guest_name?: string
          id?: string
          party_size?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsite_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "host_events"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_board_comments: {
        Row: {
          author_id: string
          author_name: string
          board_id: string
          body: string
          created_at: string
          id: string
          item_id: string | null
        }
        Insert: {
          author_id: string
          author_name: string
          board_id: string
          body: string
          created_at?: string
          id?: string
          item_id?: string | null
        }
        Update: {
          author_id?: string
          author_name?: string
          board_id?: string
          body?: string
          created_at?: string
          id?: string
          item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mood_board_comments_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "mood_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mood_board_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "mood_board_items"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_board_items: {
        Row: {
          board_id: string
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          source_url: string | null
        }
        Insert: {
          board_id: string
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          source_url?: string | null
        }
        Update: {
          board_id?: string
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mood_board_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "mood_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_boards: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          host_id: string
          id: string
          name: string
          share_token: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          host_id: string
          id?: string
          name: string
          share_token?: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          host_id?: string
          id?: string
          name?: string
          share_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          digested_at: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          digested_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          digested_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_collaborators: {
        Row: {
          created_at: string
          host_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      planning_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          host_id: string
          id: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          host_id: string
          id?: string
          invited_by: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          host_id?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_event_id: string | null
          avatar_url: string | null
          budget_max_cents: number | null
          budget_min_cents: number | null
          calendar_feed_token: string | null
          created_at: string
          daily_digest_enabled: boolean
          display_name: string | null
          event_date: string | null
          event_location: string | null
          event_notes: string | null
          event_type: string | null
          id: string
          notification_prefs: Json
          onboarded_at: string | null
          phone: string | null
          phone_verified_at: string | null
          preferred_language: string
          reengagement_emails_enabled: boolean
          role: string
          tour_dismissed_at: string | null
          updated_at: string
        }
        Insert: {
          active_event_id?: string | null
          avatar_url?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          calendar_feed_token?: string | null
          created_at?: string
          daily_digest_enabled?: boolean
          display_name?: string | null
          event_date?: string | null
          event_location?: string | null
          event_notes?: string | null
          event_type?: string | null
          id: string
          notification_prefs?: Json
          onboarded_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          reengagement_emails_enabled?: boolean
          role?: string
          tour_dismissed_at?: string | null
          updated_at?: string
        }
        Update: {
          active_event_id?: string | null
          avatar_url?: string | null
          budget_max_cents?: number | null
          budget_min_cents?: number | null
          calendar_feed_token?: string | null
          created_at?: string
          daily_digest_enabled?: boolean
          display_name?: string | null
          event_date?: string | null
          event_location?: string | null
          event_notes?: string | null
          event_type?: string | null
          id?: string
          notification_prefs?: Json
          onboarded_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          preferred_language?: string
          reengagement_emails_enabled?: boolean
          role?: string
          tour_dismissed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_event_id_fkey"
            columns: ["active_event_id"]
            isOneToOne: false
            referencedRelation: "host_events"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string
          id: string
          intro: string | null
          line_items: Json | null
          name: string
          terms: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intro?: string | null
          line_items?: Json | null
          name: string
          terms?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intro?: string | null
          line_items?: Json | null
          name?: string
          terms?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          contract_body: string | null
          contract_template_id: string | null
          created_at: string
          deposit_cents: number | null
          first_viewed_at: string | null
          host_id: string
          id: string
          inquiry_id: string
          last_viewed_at: string | null
          line_items: Json
          responded_at: string | null
          sent_at: string | null
          share_enabled: boolean
          share_token: string | null
          signed_at: string | null
          signed_name: string | null
          signed_user_agent: string | null
          status: string
          subtotal_cents: number
          terms: string | null
          title: string
          updated_at: string
          vendor_id: string
          view_count: number
        }
        Insert: {
          contract_body?: string | null
          contract_template_id?: string | null
          created_at?: string
          deposit_cents?: number | null
          first_viewed_at?: string | null
          host_id: string
          id?: string
          inquiry_id: string
          last_viewed_at?: string | null
          line_items?: Json
          responded_at?: string | null
          sent_at?: string | null
          share_enabled?: boolean
          share_token?: string | null
          signed_at?: string | null
          signed_name?: string | null
          signed_user_agent?: string | null
          status?: string
          subtotal_cents?: number
          terms?: string | null
          title: string
          updated_at?: string
          vendor_id: string
          view_count?: number
        }
        Update: {
          contract_body?: string | null
          contract_template_id?: string | null
          created_at?: string
          deposit_cents?: number | null
          first_viewed_at?: string | null
          host_id?: string
          id?: string
          inquiry_id?: string
          last_viewed_at?: string | null
          line_items?: Json
          responded_at?: string | null
          sent_at?: string | null
          share_enabled?: boolean
          share_token?: string | null
          signed_at?: string | null
          signed_name?: string | null
          signed_user_agent?: string | null
          status?: string
          subtotal_cents?: number
          terms?: string | null
          title?: string
          updated_at?: string
          vendor_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_contract_template_id_fkey"
            columns: ["contract_template_id"]
            isOneToOne: false
            referencedRelation: "vendor_contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      real_events: {
        Row: {
          cover_path: string | null
          created_at: string
          event_date: string | null
          event_type: string | null
          gallery_paths: string[]
          host_consent_given_at: string | null
          host_id: string | null
          id: string
          inquiry_id: string | null
          intro: string | null
          location: string | null
          published_at: string | null
          slug: string | null
          story: string | null
          title: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          event_date?: string | null
          event_type?: string | null
          gallery_paths?: string[]
          host_consent_given_at?: string | null
          host_id?: string | null
          id?: string
          inquiry_id?: string | null
          intro?: string | null
          location?: string | null
          published_at?: string | null
          slug?: string | null
          story?: string | null
          title: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          event_date?: string | null
          event_type?: string | null
          gallery_paths?: string[]
          host_consent_given_at?: string | null
          host_id?: string | null
          id?: string
          inquiry_id?: string | null
          intro?: string | null
          location?: string | null
          published_at?: string | null
          slug?: string | null
          story?: string | null
          title?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_events_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          host_id: string
          id: string
          inquiry_id: string
          message: string | null
          sent_at: string
          submitted_at: string | null
          token: string
          vendor_id: string
        }
        Insert: {
          host_id: string
          id?: string
          inquiry_id: string
          message?: string | null
          sent_at?: string
          submitted_at?: string | null
          token?: string
          vendor_id: string
        }
        Update: {
          host_id?: string
          id?: string
          inquiry_id?: string
          message?: string | null
          sent_at?: string
          submitted_at?: string | null
          token?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_responses: {
        Row: {
          body: string
          created_at: string
          review_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          body: string
          created_at?: string
          review_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          body?: string
          created_at?: string
          review_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_responses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          hidden_at: string | null
          hidden_reason: string | null
          host_id: string
          id: string
          inquiry_id: string
          photo_urls: Json
          rating: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          host_id: string
          id?: string
          inquiry_id: string
          photo_urls?: Json
          rating: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          host_id?: string
          id?: string
          inquiry_id?: string
          photo_urls?: Json
          rating?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: true
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          email_alerts_enabled: boolean
          filters: Json
          host_id: string
          id: string
          last_notified_at: string
          name: string
          notify_new_matches: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_alerts_enabled?: boolean
          filters?: Json
          host_id: string
          id?: string
          last_notified_at?: string
          name: string
          notify_new_matches?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_alerts_enabled?: boolean
          filters?: Json
          host_id?: string
          id?: string
          last_notified_at?: string
          name?: string
          notify_new_matches?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      saved_vendors: {
        Row: {
          created_at: string
          host_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_vendors_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_admin_id: string | null
          category: string
          closed_at: string | null
          created_at: string
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_admin_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_admin_id?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendor_availability_recurring: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_available: boolean
          start_time: string
          vendor_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_available?: boolean
          start_time: string
          vendor_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_available?: boolean
          start_time?: string
          vendor_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_availability_recurring_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_claim_listings: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          invite_email: string | null
          invite_token: string
          vendor_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_token?: string
          vendor_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_token?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_claim_listings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_contract_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contract_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_inquiry_labels: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          name: string
          vendor_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          vendor_id: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_inquiry_labels_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_intake_forms: {
        Row: {
          created_at: string
          intro: string | null
          is_published: boolean
          questions: Json
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          intro?: string | null
          is_published?: boolean
          questions?: Json
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          intro?: string | null
          is_published?: boolean
          questions?: Json
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_intake_forms_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_lead_rules: {
        Row: {
          auto_reply_template: string | null
          created_at: string
          id: string
          is_active: boolean
          match_event_types: string[] | null
          min_budget_cents: number | null
          name: string
          vendor_id: string
        }
        Insert: {
          auto_reply_template?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          match_event_types?: string[] | null
          min_budget_cents?: number | null
          name: string
          vendor_id: string
        }
        Update: {
          auto_reply_template?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          match_event_types?: string[] | null
          min_budget_cents?: number | null
          name?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_lead_rules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_message_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_message_templates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_packages: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          includes: Json
          is_active: boolean
          name: string
          price_cents: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          includes?: Json
          is_active?: boolean
          name: string
          price_cents: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          includes?: Json
          is_active?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_packages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_partner_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_vendor_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_vendor_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_vendor_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_partner_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "vendor_partner_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_partner_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          vendor_a_id: string
          vendor_b_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          vendor_a_id: string
          vendor_b_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          vendor_a_id?: string
          vendor_b_id?: string
        }
        Relationships: []
      }
      vendor_portfolio_images: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          storage_path: string
          vendor_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          storage_path: string
          vendor_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          storage_path?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_portfolio_images_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profile_extras: {
        Row: {
          certifications: Json | null
          created_at: string
          press_mentions: Json | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          certifications?: Json | null
          created_at?: string
          press_mentions?: Json | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          certifications?: Json | null
          created_at?: string
          press_mentions?: Json | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profile_extras_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profile_views: {
        Row: {
          id: string
          vendor_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          vendor_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          vendor_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profile_views_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_profile_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profiles: {
        Row: {
          awards: string[] | null
          base_price_cents: number | null
          bio: string | null
          business_name: string
          cancellation_policy: string | null
          category: string
          created_at: string
          deposit_policy: string | null
          faq: Json | null
          geocoded_at: string | null
          geocoded_location: string | null
          hourly_rate_cents: number | null
          id: string
          intro_video_url: string | null
          is_staffing: boolean
          languages: string[] | null
          latitude: number | null
          location: string | null
          longitude: number | null
          min_hours: number | null
          onboarding_nudge_sent_at: string | null
          payment_terms: string | null
          portfolio_summary: string | null
          responder_tier: string | null
          service_radius_km: number | null
          service_radius_miles: number | null
          slug: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
          weekly_digest_enabled: boolean
          weekly_digest_sent_at: string | null
        }
        Insert: {
          awards?: string[] | null
          base_price_cents?: number | null
          bio?: string | null
          business_name: string
          cancellation_policy?: string | null
          category: string
          created_at?: string
          deposit_policy?: string | null
          faq?: Json | null
          geocoded_at?: string | null
          geocoded_location?: string | null
          hourly_rate_cents?: number | null
          id?: string
          intro_video_url?: string | null
          is_staffing?: boolean
          languages?: string[] | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          min_hours?: number | null
          onboarding_nudge_sent_at?: string | null
          payment_terms?: string | null
          portfolio_summary?: string | null
          responder_tier?: string | null
          service_radius_km?: number | null
          service_radius_miles?: number | null
          slug?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
          weekly_digest_enabled?: boolean
          weekly_digest_sent_at?: string | null
        }
        Update: {
          awards?: string[] | null
          base_price_cents?: number | null
          bio?: string | null
          business_name?: string
          cancellation_policy?: string | null
          category?: string
          created_at?: string
          deposit_policy?: string | null
          faq?: Json | null
          geocoded_at?: string | null
          geocoded_location?: string | null
          hourly_rate_cents?: number | null
          id?: string
          intro_video_url?: string | null
          is_staffing?: boolean
          languages?: string[] | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          min_hours?: number | null
          onboarding_nudge_sent_at?: string | null
          payment_terms?: string | null
          portfolio_summary?: string | null
          responder_tier?: string | null
          service_radius_km?: number | null
          service_radius_miles?: number | null
          slug?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          weekly_digest_enabled?: boolean
          weekly_digest_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_recommendations: {
        Row: {
          created_at: string
          display_order: number
          id: string
          note: string | null
          recommended_id: string
          recommender_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          note?: string | null
          recommended_id: string
          recommender_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          note?: string | null
          recommended_id?: string
          recommender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_recommendations_recommended_id_fkey"
            columns: ["recommended_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_recommendations_recommender_id_fkey"
            columns: ["recommender_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reengagement_log: {
        Row: {
          event_type: string | null
          host_id: string
          id: string
          inquiry_id: string
          notified_at: string
          occasion: string
          upcoming_date: string
          vendor_id: string
        }
        Insert: {
          event_type?: string | null
          host_id: string
          id?: string
          inquiry_id: string
          notified_at?: string
          occasion: string
          upcoming_date: string
          vendor_id: string
        }
        Update: {
          event_type?: string | null
          host_id?: string
          id?: string
          inquiry_id?: string
          notified_at?: string
          occasion?: string
          upcoming_date?: string
          vendor_id?: string
        }
        Relationships: []
      }
      vendor_referrals: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          first_booking_at: string | null
          id: string
          referral_code: string
          referred_id: string | null
          referrer_id: string
          reward_percent_off: number
          rewarded_at: string | null
          signed_up_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          first_booking_at?: string | null
          id?: string
          referral_code?: string
          referred_id?: string | null
          referrer_id: string
          reward_percent_off?: number
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          first_booking_at?: string | null
          id?: string
          referral_code?: string
          referred_id?: string | null
          referrer_id?: string
          reward_percent_off?: number
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_showcase_clips: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          poster_path: string | null
          vendor_id: string
          video_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          poster_path?: string | null
          vendor_id: string
          video_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          poster_path?: string | null
          vendor_id?: string
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_showcase_clips_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
          vendor_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          token?: string
          vendor_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_team_invites_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_team_members_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_unavailable_dates: {
        Row: {
          created_at: string
          date: string
          reason: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          date: string
          reason?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          date?: string
          reason?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_unavailable_dates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_verifications: {
        Row: {
          document_path: string
          expires_at: string | null
          id: string
          kind: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          vendor_id: string
        }
        Insert: {
          document_path: string
          expires_at?: string | null
          id?: string
          kind: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          vendor_id: string
        }
        Update: {
          document_path?: string
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_verifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vendor_public_badges: {
        Row: {
          kinds: string[] | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_verifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_party_invite: { Args: { p_token: string }; Returns: Json }
      accept_planning_invite: { Args: { p_token: string }; Returns: Json }
      accept_team_invite: { Args: { p_token: string }; Returns: Json }
      can_access_inquiry: { Args: { _inquiry_id: string }; Returns: boolean }
      claim_vendor_listing: { Args: { p_token: string }; Returns: Json }
      find_or_create_partner_thread: {
        Args: { p_my_vendor_id?: string; p_other_vendor_id: string }
        Returns: string
      }
      generate_real_event_slug: {
        Args: { p_id: string; p_title: string }
        Returns: string
      }
      get_album_by_token: { Args: { p_token: string }; Returns: Json }
      get_budget_benchmarks: {
        Args: { p_category: string; p_location?: string }
        Returns: Json
      }
      get_claim_invitation_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      get_cobooked_vendors: {
        Args: { p_limit?: number; p_vendor_id: string }
        Returns: {
          business_name: string
          category: string
          cobookings: number
          is_curated: boolean
          location: string
          vendor_id: string
        }[]
      }
      get_email_daily_volume: {
        Args: { p_window_days?: number }
        Returns: {
          bounced: number
          day: string
          delivered: number
          sent: number
        }[]
      }
      get_email_deliverability_summary: {
        Args: { p_window_days?: number }
        Returns: Json
      }
      get_guest_by_token: {
        Args: { p_token: string }
        Returns: {
          event_date: string
          event_location: string
          event_type: string
          host_name: string
          id: string
          name: string
          plus_one_allowed: boolean
          rsvp_dietary: string
          rsvp_message: string
          rsvp_plus_one: boolean
          rsvp_status: string
        }[]
      }
      get_microsite_by_token: { Args: { p_token: string }; Returns: Json }
      get_microsite_rsvp_config: { Args: { p_token: string }; Returns: Json }
      get_mood_board_by_token: { Args: { p_token: string }; Returns: Json }
      get_party_invite_by_token: { Args: { p_token: string }; Returns: Json }
      get_party_portal: { Args: { p_event_id: string }; Returns: Json }
      get_planner_workspace: { Args: never; Returns: Json }
      get_planning_invite_by_token: { Args: { p_token: string }; Returns: Json }
      get_proposal_by_share_token: { Args: { p_token: string }; Returns: Json }
      get_recommended_for_host: {
        Args: { p_host_id: string; p_limit?: number }
        Returns: {
          business_name: string
          category: string
          cobookings: number
          location: string
          vendor_id: string
        }[]
      }
      get_review_request_context: { Args: { p_token: string }; Returns: Json }
      get_team_invite_by_token: { Args: { p_token: string }; Returns: Json }
      get_vendor_availability: {
        Args: { p_from: string; p_to: string; p_vendor_id: string }
        Returns: Json
      }
      get_vendor_benchmarks: {
        Args: { p_category: string; p_window_days?: number }
        Returns: {
          median_booking_rate: number
          median_inquiries: number
          median_response_hours: number
          peer_count: number
        }[]
      }
      get_vendor_profile_score: { Args: { p_vendor_id: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_inquiry_vendor_member: {
        Args: { _inquiry_id: string }
        Returns: boolean
      }
      is_planning_collaborator: { Args: { _host_id: string }; Returns: boolean }
      is_planning_editor: { Args: { _host_id: string }; Returns: boolean }
      is_vendor_member: { Args: { _vendor_id: string }; Returns: boolean }
      is_vendor_owner: { Args: { _vendor_id: string }; Returns: boolean }
      is_vendor_team_admin: { Args: { _vendor_id: string }; Returns: boolean }
      list_my_party_events: {
        Args: never
        Returns: {
          event_date: string
          event_id: string
          event_location: string
          event_name: string
          event_type: string
          host_name: string
          invite_id: string
          role_label: string
        }[]
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_summary?: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      mark_proposal_viewed: {
        Args: { p_proposal_id: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: undefined }
      send_review_request: {
        Args: {
          p_host_email: string
          p_inquiry_id: string
          p_message: string
          p_vendor_id: string
        }
        Returns: Json
      }
      set_active_event: { Args: { p_event_id: string }; Returns: undefined }
      shares_vendor_team: { Args: { _user_id: string }; Returns: boolean }
      slugify_vendor_name: { Args: { p_name: string }; Returns: string }
      submit_microsite_rsvp: {
        Args: {
          p_answers: Json
          p_attending: boolean
          p_dietary: string
          p_guest_email: string
          p_guest_name: string
          p_party_size: number
          p_token: string
        }
        Returns: Json
      }
      submit_review_via_token: {
        Args: {
          p_body: string
          p_rating: number
          p_title: string
          p_token: string
        }
        Returns: Json
      }
      submit_rsvp: {
        Args: {
          p_dietary: string
          p_message: string
          p_plus_one: boolean
          p_status: string
          p_token: string
        }
        Returns: undefined
      }
      toggle_proposal_share: {
        Args: { p_enabled: boolean; p_proposal_id: string }
        Returns: Json
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

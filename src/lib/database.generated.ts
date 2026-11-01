// Generated from information_schema and pg_enum after applying the repository migration.
// Reproduce: PORTFOLIO_GENERATE_TYPES=1 npm run test:policies
// Never add credentials or private schema types to this public API contract.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface Database {
  public: {
    Tables: {
      certifications: {
        Row: {
          id: string;
          title: string;
          issuer: string;
          issued_on: string | null;
          url: string | null;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          issuer: string;
          issued_on?: string | null;
          url?: string | null;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          issuer?: string;
          issued_on?: string | null;
          url?: string | null;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      education: {
        Row: {
          id: string;
          institution: string;
          degree: string;
          start_year: number;
          end_year: number | null;
          url: string | null;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          institution: string;
          degree: string;
          start_year: number;
          end_year?: number | null;
          url?: string | null;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          institution?: string;
          degree?: string;
          start_year?: number;
          end_year?: number | null;
          url?: string | null;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      experiences: {
        Row: {
          id: string;
          slug: string;
          company: string;
          position: string;
          location: string;
          start_date: string;
          end_date: string | null;
          highlights: string[];
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          company: string;
          position: string;
          location?: string;
          start_date: string;
          end_date?: string | null;
          highlights?: string[];
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          company?: string;
          position?: string;
          location?: string;
          start_date?: string;
          end_date?: string | null;
          highlights?: string[];
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile: {
        Row: {
          id: string;
          slug: string;
          name: string;
          title: string;
          headline: string;
          introduction: string;
          about: string;
          location: string;
          email: string;
          image_url: string | null;
          resume_url: string | null;
          current_focus: string;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          title: string;
          headline: string;
          introduction: string;
          about: string;
          location?: string;
          email: string;
          image_url?: string | null;
          resume_url?: string | null;
          current_focus?: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          title?: string;
          headline?: string;
          introduction?: string;
          about?: string;
          location?: string;
          email?: string;
          image_url?: string | null;
          resume_url?: string | null;
          current_focus?: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_links: {
        Row: {
          id: string;
          project_id: string;
          kind: string;
          label: string;
          url: string;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          kind: string;
          label: string;
          url: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          kind?: string;
          label?: string;
          url?: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_links_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          slug: string;
          title: string;
          category: string;
          summary: string;
          description: string;
          role: string | null;
          organization: string | null;
          start_date: string | null;
          end_date: string | null;
          problem: string | null;
          approach: string | null;
          responsibilities: string[];
          outcomes: string[];
          technologies: string[];
          image_url: string | null;
          image_alt: string | null;
          visual_kind: string;
          featured: boolean;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          category: string;
          summary: string;
          description?: string;
          role?: string | null;
          organization?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          problem?: string | null;
          approach?: string | null;
          responsibilities?: string[];
          outcomes?: string[];
          technologies?: string[];
          image_url?: string | null;
          image_alt?: string | null;
          visual_kind?: string;
          featured?: boolean;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          category?: string;
          summary?: string;
          description?: string;
          role?: string | null;
          organization?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          problem?: string | null;
          approach?: string | null;
          responsibilities?: string[];
          outcomes?: string[];
          technologies?: string[];
          image_url?: string | null;
          image_alt?: string | null;
          visual_kind?: string;
          featured?: boolean;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      publications: {
        Row: {
          id: string;
          slug: string;
          title: string;
          summary: string;
          platform: string;
          published_on: string | null;
          url: string;
          featured: boolean;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          summary?: string;
          platform: string;
          published_on?: string | null;
          url: string;
          featured?: boolean;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          summary?: string;
          platform?: string;
          published_on?: string | null;
          url?: string;
          featured?: boolean;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          id: string;
          name: string;
          category: string;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      social_links: {
        Row: {
          id: string;
          network: string;
          url: string;
          status: "draft" | "published";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          network: string;
          url: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          network?: string;
          url?: string;
          status?: "draft" | "published";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ingest_analytics: { Args: { p_event: Json }; Returns: boolean };
    };
    Enums: {
      publication_status: "draft" | "published";
    };
    CompositeTypes: Record<string, never>;
  };
}

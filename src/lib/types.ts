import type { Database } from "./database.generated";
type Tables = Database["public"]["Tables"];
export type Status = Database["public"]["Enums"]["publication_status"];
export type Profile = Tables["profile"]["Row"];
export type ContentRow = Pick<
  Profile,
  "id" | "status" | "sort_order" | "created_at" | "updated_at"
>;
export type Project = Omit<Tables["projects"]["Row"], "visual_kind"> & {
  visual_kind: "search" | "retrieval" | "pipeline" | "chart" | "vision";
};
export type ProjectLink = Tables["project_links"]["Row"];
export type Experience = Tables["experiences"]["Row"];
export type Education = Tables["education"]["Row"];
export type Skill = Tables["skills"]["Row"];
export type Certification = Tables["certifications"]["Row"];
export type Publication = Tables["publications"]["Row"];
export type SocialLink = Tables["social_links"]["Row"];
export interface Content {
  profile: Profile[];
  projects: Project[];
  project_links: ProjectLink[];
  experiences: Experience[];
  education: Education[];
  skills: Skill[];
  certifications: Certification[];
  publications: Publication[];
  social_links: SocialLink[];
}
export interface Snapshot {
  version: 1;
  exported_at: string;
  content: Content;
}
export const TABLES = [
  "profile",
  "projects",
  "project_links",
  "experiences",
  "education",
  "skills",
  "certifications",
  "publications",
  "social_links",
] as const;

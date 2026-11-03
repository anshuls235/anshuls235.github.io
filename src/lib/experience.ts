import type { Experience } from "./types";

export interface CareerChapter {
  company: string;
  start: string;
  end: string | null;
  roles: Experience[];
}

// Neighbouring roles form one chapter; a later return stays a separate chapter.
export function careerChapters(experiences: Experience[]): CareerChapter[] {
  const chapters: CareerChapter[] = [];
  for (const role of experiences) {
    const previous = chapters.at(-1);
    if (previous?.company.trim().toLocaleLowerCase() === role.company.trim().toLocaleLowerCase()) {
      previous.roles.push(role);
      previous.start = [previous.start, role.start_date].sort()[0];
      previous.end = previous.end && role.end_date
        ? [previous.end, role.end_date].sort().at(-1)!
        : null;
    } else {
      chapters.push({ company: role.company, start: role.start_date, end: role.end_date, roles: [role] });
    }
  }
  return chapters;
}

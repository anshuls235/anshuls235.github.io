import settings from "../content/public-settings.json";
import { publicConfig } from "./content";
export function configuredProject(url?: string, key?: string) {
  return url || key
    ? publicConfig(url, key)
    : publicConfig(settings.supabaseUrl, settings.publishableKey);
}
export function configuredAnalytics(value?: string) {
  return value ? value === "true" : settings.analyticsEnabled;
}

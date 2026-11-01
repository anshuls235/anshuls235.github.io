import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "tmp/**",
      "output/**",
      "test-results/**",
      "playwright-report/**",
      "node_modules/**",
      ".*/**",
      "graphify-out/**",
      "script.js",
      "supabase/functions/analytics/index.ts",
      "supabase/functions/analytics/handler.test.ts",
      "supabase/functions/analytics/handler.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);

import { createHandler } from './handler.ts';
// Built-in server-side service role is never copied into the browser or repository.
Deno.serve(createHandler({
  url:Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  origins:Deno.env.get('ALLOWED_ORIGINS') ?? 'https://anshuls235.github.io,http://127.0.0.1:4173,http://127.0.0.1:5173'
}));

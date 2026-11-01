-- Supabase's optional dashboard auto-RLS event trigger is not a public RPC.
-- Revoking direct execution does not prevent the owner-operated event trigger.
begin;
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  revoke all on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;
commit;

begin;
-- Expected public rows are counted by the owner before drafts are added.
create temporary table expected_public(table_name text, n bigint);
alter table expected_public enable row level security;
create policy expected_read on expected_public for select to anon,authenticated using(true);
-- Only test-local changes; the final rollback restores existing quota state.
delete from private.analytics_limits where bucket=date_trunc('minute',now());
do $$ declare t text; r jsonb; begin
 foreach t in array array['profile','projects','project_links','experiences','education','skills','certifications','publications','social_links'] loop
  execute format('insert into expected_public select %L,count(*) from public.%I where status=''published''',t,t);
  execute format('select to_jsonb(x) from public.%I x limit 1',t) into r;
  r := r || jsonb_build_object('id',gen_random_uuid(),'status','draft');
  if r ? 'slug' then r:=r || jsonb_build_object('slug','test-draft-'||replace(gen_random_uuid()::text,'-','')); end if;
  if t='skills' then r:=r||jsonb_build_object('name','test-draft-skill'); end if;
  if t='social_links' then r:=r||jsonb_build_object('network','test-draft-network'); end if;
  if t='project_links' then r:=r||jsonb_build_object('url','https://example.com/test-draft');end if;
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1)',t,t) using r;
 end loop;
end $$;
grant select on expected_public to anon,authenticated;
-- Even a published child link must be hidden if its parent is a draft.
insert into public.project_links(project_id,kind,label,url,status)
 select id,'website','Hidden parent link','https://example.com/hidden-parent','published' from public.projects where status='draft' limit 1;

set local role anon;
do $$ declare t text; n bigint; expected bigint; begin
 foreach t in array array['profile','projects','project_links','experiences','education','skills','certifications','publications','social_links'] loop
  execute format('select count(*) from public.%I',t) into n;
  select ep.n into expected from expected_public ep where table_name=t;
  assert n=expected,format('Anon read leaked draft rows: %s (%s vs %s)',t,n,expected);
  assert not has_table_privilege('anon','public.'||t,'INSERT'), 'Anon insert privilege';
  assert not has_table_privilege('anon','public.'||t,'UPDATE'), 'Anon update privilege';
  assert not has_table_privilege('anon','public.'||t,'DELETE'), 'Anon delete privilege';
 end loop;
 begin insert into public.projects(slug,title,category,summary)values('attack','attack','attack','attack');raise exception 'Anon insert succeeded'; exception when insufficient_privilege then null; end;
 begin update public.projects set title='attack';raise exception 'Anon update succeeded'; exception when insufficient_privilege then null; end;
 begin delete from public.projects;raise exception 'Anon delete succeeded'; exception when insufficient_privilege then null; end;
 begin perform * from private.page_views;raise exception 'Anon analytics read succeeded'; exception when insufficient_privilege then null; end;
 begin insert into private.page_views(id,session_id,path)values(gen_random_uuid(),gen_random_uuid(),'/');raise exception 'Anon analytics write succeeded'; exception when insufficient_privilege then null; end;
 begin perform public.ingest_analytics('{}');raise exception 'Anon RPC succeeded'; exception when insufficient_privilege then null; end;
 assert not has_schema_privilege('anon','private','USAGE'),'Private schema exposed';
end $$;
reset role;
set local role authenticated;
do $$ declare t text; n bigint; expected bigint; begin
 foreach t in array array['profile','projects','project_links','experiences','education','skills','certifications','publications','social_links'] loop
  execute format('select count(*) from public.%I',t) into n;
  select ep.n into expected from expected_public ep where table_name=t;
  assert n=expected,'Authenticated draft leakage';
  assert not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),'Unexpected authenticated writes';
 end loop;
 assert not has_schema_privilege('authenticated','private','USAGE'),'Authenticated analytics access';
 assert not has_function_privilege('authenticated','public.ingest_analytics(jsonb)','EXECUTE'),'Authenticated RPC access';
end $$;
reset role;
set local role service_role;
do $$ declare s uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); data jsonb; i integer; accepted boolean; begin
 data:=jsonb_build_object('event_id',ev,'session_id',s,'event','page_view','path','/');
 assert public.ingest_analytics(data),'Valid server event rejected';
 assert public.ingest_analytics(data),'Duplicate acknowledgment failed';
 assert (select count(*) from private.page_views where id=ev)=1,'Deduplication failed';
 for i in 3..60 loop
  assert public.ingest_analytics(data||jsonb_build_object('event_id',gen_random_uuid())),'Premature quota';
 end loop;
 assert not public.ingest_analytics(data||jsonb_build_object('event_id',gen_random_uuid())),'Per-session quota failed';
 for i in 1..539 loop
  accepted:=public.ingest_analytics(data||jsonb_build_object('event_id',gen_random_uuid(),'session_id',gen_random_uuid()));
  assert accepted,'Premature global quota';
 end loop;
 assert not public.ingest_analytics(data||jsonb_build_object('event_id',gen_random_uuid(),'session_id',gen_random_uuid())),'Global quota failed';
 begin perform public.ingest_analytics(jsonb_build_object('event_id',gen_random_uuid(),'session_id',s,'event','project_view','path','/','project_id',gen_random_uuid()));raise exception 'Unknown project accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$ declare n integer; begin
 select count(*) into n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity;
 assert n=0,'Table missing RLS';
 assert (select count(*) from information_schema.columns where table_schema='private' and (column_name like '%ip_address%' or column_name='user_agent'))=0,'Sensitive analytics column';
end $$;
rollback;
\echo 'Policy tests passed: all content tables, parent drafts, mutations, analytics privacy, deduplication and atomic quotas.'

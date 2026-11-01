begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create type public.publication_status as enum ('draft','published');
create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
revoke all on function private.touch_updated_at() from public;

create table public.profile (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null, title text not null, headline text not null, introduction text not null,
 about text not null, location text not null default '', email text not null,
 image_url text check (image_url is null or image_url ~ '^(https://|assets/)'),
 resume_url text check (resume_url is null or resume_url ~ '^(https://|resume\.pdf$)'),
 current_focus text not null default '',
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index profile_one_published on public.profile ((status)) where status = 'published';

create table public.projects (
 id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null, category text not null, summary text not null, description text not null default '',
 role text, organization text, start_date date, end_date date,
 problem text, approach text,
 responsibilities text[] not null default '{}', outcomes text[] not null default '{}',
 technologies text[] not null default '{}', image_url text check (image_url is null or image_url ~ '^(https://|assets/)'), image_alt text,
 visual_kind text not null default 'pipeline' check (visual_kind in ('search','retrieval','pipeline','chart','vision')),
 featured boolean not null default false,
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.project_links (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 kind text not null, label text not null, url text not null check (url ~ '^https://'),
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,url)
);
create index project_links_parent on public.project_links(project_id);
create table public.experiences (
 id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 company text not null, position text not null, location text not null default '',
 start_date date not null, end_date date, highlights text[] not null default '{}',
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (end_date is null or end_date >= start_date)
);
create table public.education (
 id uuid primary key default gen_random_uuid(), institution text not null, degree text not null,
 start_year integer not null check (start_year between 1900 and 2200), end_year integer check (end_year between 1900 and 2200),
 url text check (url is null or url ~ '^https://'),
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (end_year is null or end_year >= start_year)
);
create table public.skills (
 id uuid primary key default gen_random_uuid(), name text not null, category text not null,
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(name,category)
);
create table public.certifications (
 id uuid primary key default gen_random_uuid(), title text not null, issuer text not null, issued_on date,
 url text check (url is null or url ~ '^https://'),
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.publications (
 id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null, summary text not null default '', platform text not null, published_on date,
 url text not null check (url ~ '^https://'), featured boolean not null default false,
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.social_links (
 id uuid primary key default gen_random_uuid(), network text not null unique, url text not null check (url ~ '^https://'),
 status public.publication_status not null default 'draft', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin
 foreach t in array array['profile','projects','project_links','experiences','education','skills','certifications','publications','social_links'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  execute format('create index %I on public.%I (status,sort_order,id)',t||'_published_order',t);
  if t <> 'project_links' then
   execute format('create policy published_read on public.%I for select to anon, authenticated using (status = ''published''::public.publication_status)',t);
  end if;
 end loop;
end $$;
create policy published_read on public.project_links for select to anon, authenticated using (
 status = 'published' and exists(select 1 from public.projects p where p.id = project_links.project_id and p.status = 'published')
);

create table private.page_views (
 id uuid primary key, session_id uuid not null, path text not null check(length(path)<=200),
 referrer text check(length(referrer)<=253), utm jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.interaction_events (
 id uuid primary key, session_id uuid not null, event text not null check(event in ('project_view','project_link','cv_download','contact_action','social_click')),
 path text not null check(length(path)<=200), project_id uuid references public.projects(id) on delete set null,
 link_id uuid references public.project_links(id) on delete set null, platform text,
 referrer text check(length(referrer)<=253), utm jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.analytics_limits (
 scope text not null, bucket timestamptz not null, hits integer not null default 1 check(hits>0), primary key(scope,bucket)
);
create index page_views_time on private.page_views(created_at);
create index page_views_session on private.page_views(session_id,created_at);
create index interactions_time on private.interaction_events(created_at);
create index interactions_project on private.interaction_events(project_id) where project_id is not null;
create index interactions_link on private.interaction_events(link_id) where link_id is not null;

do $$ declare t text; begin
 foreach t in array array['page_views','interaction_events','analytics_limits'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public, anon, authenticated',t);
  execute format('grant all on private.%I to service_role',t);
 end loop;
end $$;

-- This is the only analytics entry point through the Data API. Only service_role
-- may execute it; anonymous callers must pass Edge validation first.
create function public.ingest_analytics(p_event jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
 event_name text := p_event->>'event'; session uuid := (p_event->>'session_id')::uuid;
 event_uuid uuid := (p_event->>'event_id')::uuid;
 project uuid := nullif(p_event->>'project_id','')::uuid;
 project_link uuid := nullif(p_event->>'link_id','')::uuid;
 event_path text := p_event->>'path'; n integer;
 bucket_time timestamptz := date_trunc('minute',now());
begin
 if event_name not in ('page_view','project_view','project_link','cv_download','contact_action','social_click') or session is null or event_uuid is null or event_path is null or length(event_path)>200 or event_path !~ '^/([a-zA-Z0-9_-]+/)*([a-zA-Z0-9_.-]+)?(#work/[a-z0-9-]+)?$' then raise exception 'Invalid analytics event' using errcode='22023'; end if;
 if project is not null and not exists(select 1 from public.projects where id=project and status='published') then raise exception 'Unknown published project' using errcode='22023'; end if;
 if project_link is not null and not exists(select 1 from public.project_links l join public.projects p on p.id=l.project_id where l.id=project_link and l.project_id=project and l.status='published' and p.status='published') then raise exception 'Unknown published project link' using errcode='22023'; end if;
 if event_name in ('project_view','project_link') and project is null then raise exception 'Project required' using errcode='22023'; end if;
 if event_name='project_link' and project_link is null then raise exception 'Link required' using errcode='22023'; end if;
 -- Global cap prevents rotating arbitrary session IDs from creating unbounded data.
 insert into private.analytics_limits(scope,bucket) values('global',bucket_time)
 on conflict(scope,bucket) do update set hits=private.analytics_limits.hits+1 returning hits into n;
 if n>600 then return false; end if;
 insert into private.analytics_limits(scope,bucket) values('session:'||session::text,bucket_time)
 on conflict(scope,bucket) do update set hits=private.analytics_limits.hits+1 returning hits into n;
 if n>60 then return false; end if;
 if event_name='page_view' then
  insert into private.page_views(id,session_id,path,referrer,utm) values(event_uuid,session,event_path,p_event->>'referrer',coalesce(p_event->'utm','{}'::jsonb)) on conflict(id) do nothing;
 else
  insert into private.interaction_events(id,session_id,event,path,project_id,link_id,platform,referrer,utm) values(event_uuid,session,event_name,event_path,project,project_link,p_event->>'platform',p_event->>'referrer',coalesce(p_event->'utm','{}'::jsonb)) on conflict(id) do nothing;
 end if;
 return true;
end $$;
revoke all on function public.ingest_analytics(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_analytics(jsonb) to service_role;

-- Reports remain in an unexposed schema, with RLS tables underneath.
create view private.traffic_daily with (security_invoker=true) as
 select (created_at at time zone 'UTC')::date as day, count(*) page_views, count(distinct session_id) approximate_sessions from private.page_views group by 1;
create view private.traffic_monthly with (security_invoker=true) as
 select date_trunc('month',created_at at time zone 'UTC')::date as month,count(*) page_views,count(distinct session_id) approximate_sessions from private.page_views group by 1;
create view private.top_pages with (security_invoker=true) as select path,count(*) page_views from private.page_views group by path;
create view private.referrers with (security_invoker=true) as select coalesce(referrer,'Direct / unknown') referrer,count(*) page_views from private.page_views group by 1;
create view private.project_engagement with (security_invoker=true) as
 select project_id,count(*) filter(where event='project_view') project_views,count(*) filter(where event='project_link') link_clicks from private.interaction_events where project_id is not null group by project_id;
create view private.link_engagement with (security_invoker=true) as select link_id,count(*) clicks from private.interaction_events where event='project_link' group by link_id;
create view private.actions with (security_invoker=true) as select event,platform,count(*) events from private.interaction_events group by event,platform;
revoke all on all tables in schema private from public,anon,authenticated;
grant select on all tables in schema private to service_role;

create function private.prune_analytics() returns void language sql security definer set search_path='' as $$
 delete from private.page_views where created_at < now()-interval '90 days';
 delete from private.interaction_events where created_at < now()-interval '90 days';
 delete from private.analytics_limits where bucket < now()-interval '1 day';
$$;
revoke all on function private.prune_analytics() from public,anon,authenticated;
comment on function private.prune_analytics() is 'Run daily with the supplied pg_cron setup query. Deletes raw events older than 90 days and expired quota buckets.';
commit;

-- Run as the owner in Supabase SQL Editor. Never expose these through a public API.
select count(*) as total_page_views, count(distinct session_id) as approximate_sessions from private.page_views;
select * from private.traffic_daily order by day desc;
select * from private.traffic_monthly order by month desc;
select * from private.top_pages order by page_views desc;
select p.title,e.project_views,e.link_clicks from private.project_engagement e left join public.projects p on p.id=e.project_id order by e.project_views desc;
select l.label,l.url,e.clicks from private.link_engagement e left join public.project_links l on l.id=e.link_id order by e.clicks desc;
select * from private.referrers order by page_views desc;
select * from private.actions order by events desc;
-- Approximate sessions are page-memory markers, not persistent people or exact visits.
-- Hash routes are interaction events, not artificial extra initial page views.

-- Enable the Supabase Cron integration (pg_cron), then run once as project owner.
create extension if not exists pg_cron;
select cron.schedule('portfolio-analytics-retention','17 2 * * *','select private.prune_analytics();')
where not exists(select 1 from cron.job where jobname='portfolio-analytics-retention');
-- Verify only the expected job, without exposing any credentials:
select jobid,jobname,schedule,active from cron.job where jobname='portfolio-analytics-retention';

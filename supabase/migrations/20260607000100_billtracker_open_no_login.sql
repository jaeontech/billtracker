-- No login in v1: the shared mmweb-db project isn't using auth, and we don't want
-- a login gate yet. Open the billtracker schema to the `anon` role so the app
-- works with just the publishable key — no sign-in. The data is non-sensitive
-- (bill names + amounts) and isolated in its own schema.
--
-- RLS stays ENABLED with a permissive `to public` policy, so adding a real login
-- later is a one-line change (swap `public` for `authenticated`) rather than a
-- re-architecture.

grant usage on schema billtracker to anon;
grant all on all tables in schema billtracker to anon;
alter default privileges in schema billtracker grant all on tables to anon;

drop policy authed_all on billtracker.settings;
drop policy authed_all on billtracker.recurring_templates;
drop policy authed_all on billtracker.pay_blocks;
drop policy authed_all on billtracker.bills;
drop policy authed_all on billtracker.activity_log;

create policy anyone_all on billtracker.settings            for all to public using (true) with check (true);
create policy anyone_all on billtracker.recurring_templates for all to public using (true) with check (true);
create policy anyone_all on billtracker.pay_blocks          for all to public using (true) with check (true);
create policy anyone_all on billtracker.bills               for all to public using (true) with check (true);
create policy anyone_all on billtracker.activity_log        for all to public using (true) with check (true);

-- Weekly templates: `weekday` set (0=Sun…5=Fri…6=Sat) → seeds one bill per
-- matching weekday, named "<name> MM/DD". weekday null → monthly via due_day.
alter table billtracker.recurring_templates
  add column if not exists weekday smallint check (weekday between 0 and 6),
  alter column due_day drop not null;
alter table billtracker.recurring_templates
  add constraint template_cadence check ((weekday is null) <> (due_day is null));

-- The household allowance: $600 every Friday (amount editable on the Templates page).
insert into billtracker.recurring_templates (name, amount, method, weekday, due_day)
select 'Household', 600, 'manual', 5, null
where not exists (select 1 from billtracker.recurring_templates where weekday is not null);

notify pgrst, 'reload schema';

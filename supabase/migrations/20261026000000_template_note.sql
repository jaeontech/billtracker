-- A freeform note on a recurring template (e.g. "starts May 2027").
alter table billtracker.recurring_templates add column if not exists note text;

-- Let a pay block be marked completed (collapses to a one-line summary) and
-- hidden (removed from the board, restorable from a "hidden" toggle).
alter table billtracker.pay_blocks
  add column if not exists completed boolean not null default false,
  add column if not exists hidden    boolean not null default false;

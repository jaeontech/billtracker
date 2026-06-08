-- A freeform comment/note on a pay block.
alter table billtracker.pay_blocks add column if not exists note text;

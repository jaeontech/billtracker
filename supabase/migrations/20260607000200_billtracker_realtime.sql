-- Live two-device sync: broadcast row changes on the board tables so both
-- partners see each other's edits instantly. Adds the billtracker tables to
-- Supabase's realtime publication. The app subscribes and refetches on any change.
alter publication supabase_realtime add table billtracker.pay_blocks;
alter publication supabase_realtime add table billtracker.bills;
alter publication supabase_realtime add table billtracker.recurring_templates;
alter publication supabase_realtime add table billtracker.settings;

-- Create hubspot_tickets table
create table if not exists hubspot_tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  ticket_link text,
  category text,
  list_detail text,
  contacts_to_enrich integer not null default 0,
  fields_to_enrich text,
  eta date,
  enrichment_status text,
  valid_enriched integer,
  hit_rate numeric,
  final_status text,
  notes text,
  owner text
);

-- Seed existing data from lib/hubspot.ts (run once)
insert into hubspot_tickets (ticket_link, category, list_detail, contacts_to_enrich, fields_to_enrich, eta, enrichment_status, valid_enriched, hit_rate, final_status, notes, owner) values
('https://app.hubspot.com/help-desk/21635735/view/95291824/ticket/29859078751?messageId=88897188107', 'Event Registration List', 'RE/max event registration list', 438, 'Full Name, Email, Phone, Brokerage', '2025-09-24', 'Done', 328, 0.7489, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/28656220936', 'Event Attendee List', 'Inman Connect 2025', 1922, 'Full Name, Company, Designation', null, 'Done', 493, 0.2565, null, null, null),
(null, 'Vector', 'AI SDR', 528, 'Full Name, Email, Website, LinkedIn', '2025-09-22', 'Done', 426, 0.8068, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/29023029326', 'Event Attendee List', 'Tom Ferry Summit Email Request for Sales Sequence', 3913, 'Full Name, Email', null, 'Done', 1521, 0.3887, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/30138883337', 'Event Attendee List', 'Sold.com webinar', 269, 'Full Name, Email, Phone', '2025-09-29', 'Done', 171, 0.6357, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/30070757748', 'Sales Outbound Request', 'Side Partner Webinar- SDR Lists', 85, 'Full Name, Email, Phone, Website, Company', '2025-01-10', 'Done', 51, 0.6, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/31221489688', 'Better Homes & Garden Event- List Request', null, 91, null, null, 'Done', 91, 1.0, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/32014098798', 'Event Attendee List', 'Tom Ferry Leadership Event- List Creation', 230, 'Full Name, Email, Phone, Website, Company, Brokerage', '2025-10-23', 'Done', 182, 0.7913, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/32618435669/view/1', 'Event Attendee List', 'Homesmart Ignite Attendee List Enrichment', 499, 'Full Name, Email', '2025-10-24', 'Done', 269, 0.5391, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/32711026277/view/1', 'Sales Outbound Request', 'Texas Premium Realty', 278, 'Full Name, Company, Email, Phone', '2025-10-28', 'Done', 102, 0.3669, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/35649649328', 'CS Request', 'Existing customer with no team-size category tagging', 379, 'Full Name, Company, Email, Phone', '2025-10-28', 'Done', 368, 0.971, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/35649773369', 'CS Request', 'Existing customer with no team-size category tagging', 216, 'Full Name, Company, Email, Phone', '2025-04-12', 'Done', 200, 0.9259, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/37108365425/view/1', 'Event Attendee List', 'List Upload for Tom Ferry Leadership Retreat Event', 150, 'Full Name, Email, Phone, Location', '2025-10-12', 'Done', 92, 0.6133, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/37069207044/', 'Event Attendee List', null, 502, 'Full Name, Email, Phone', '2025-11-12', 'Done', 328, 0.6534, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/37727234421/view/1', 'Event Attendee List', null, 150, 'Full Name, Email, Phone, Location', '2025-12-29', 'Done', 86, 0.5733, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/39690512962', 'Event Attendee List', 'GloverU Live 2026 | Attendee List', 1085, 'Full Name, Email, Phone, Location, Company', '2025-01-21', 'Done', 666, 0.6138, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/40473681972', 'Event Attendee List', 'TF Elite Retreat 2026 | Attendee List', 1575, 'Full Name, Email, Phone, Location', '2026-03-02', 'Done', 1131, 0.7181, 'Team size: 1326', null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/40560278919', 'Event Attendee List', 'NextHome webinar registration & attendee list', 132, 'Full Name, Email', '2026-04-02', 'Done', 56, 0.4242, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/41126727092', 'Event Attendee List', 'Sold.com webinar opt in leads', 132, 'Full Name, Email, Phone', '2026-10-02', 'Done', 86, 0.6515, null, null, null),
('https://app.hubspot.com/contacts/21635735/record/0-5/42227426984', 'Event Attendee List', 'Nexthome pre-event attendee list', 538, 'Full Name, Email, Company, Location', '2025-02-25', 'Done', 339, 0.6301, null, null, null);

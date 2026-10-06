-- Departments are company-wide and shared by every organization.
update public.departments set organization_id = null where organization_id is not null;

alter table public.departments drop constraint if exists departments_universal;
alter table public.departments add constraint departments_universal check (organization_id is null);

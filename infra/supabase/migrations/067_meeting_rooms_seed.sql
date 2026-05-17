-- Seed sale riunioni standard per company demo (idempotente).

insert into public.meeting_rooms (
  company_id,
  name,
  location,
  seats,
  has_screen,
  has_projector,
  has_whiteboard,
  has_video_conference,
  extra_features
)
select
  v.company_id,
  v.name,
  v.location,
  v.seats,
  v.has_screen,
  v.has_projector,
  v.has_whiteboard,
  v.has_video_conference,
  v.extra_features
from (
  values
    ('comp-1', 'Aurora', 'Piano 3 · Ala est', 8, true, true, true, true, array['luce naturale']::text[]),
    ('comp-1', 'Forge', 'Piano 2 · Open space', 14, true, true, true, true, array['tavolo modulare']::text[]),
    ('comp-1', 'Summit', 'Piano 5 · Executive', 6, true, false, true, true, array['vista panoramica']::text[]),
    ('comp-1', 'Quiet Lab', 'Piano 1 · Area focus', 4, false, false, true, false, array['insonorizzata']::text[]),
    ('comp-1', 'Harbor', 'Piano 2 · Reception', 10, true, true, false, true, array['caffè in sala']::text[]),
    ('comp-1', 'Nebula', 'Piano 4 · Innovation', 12, true, true, true, true, array['lavagna digitale']::text[]),
    ('comp-1', 'Atlas', 'Piano 3 · Centro', 16, true, true, true, true, array['sala plenaria']::text[])
) as v (
  company_id,
  name,
  location,
  seats,
  has_screen,
  has_projector,
  has_whiteboard,
  has_video_conference,
  extra_features
)
where not exists (
  select 1
  from public.meeting_rooms r
  where r.company_id = v.company_id
    and r.name = v.name
);

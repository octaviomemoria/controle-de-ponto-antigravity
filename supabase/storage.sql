-- Buckets privados usados pelo aplicativo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'company-logos',
    'company-logos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  ),
  (
    'employee-photos',
    'employee-photos',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'punch-photos',
    'punch-photos',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'certificates',
    'certificates',
    false,
    20971520,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


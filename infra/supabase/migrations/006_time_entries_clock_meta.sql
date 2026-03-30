-- Meta timbratura multi-canale (app/web/QR/NFC/badge) e geolocalizzazione opzionale
alter table time_entries add column if not exists source text null;
alter table time_entries add column if not exists "deviceId" text null;
alter table time_entries add column if not exists geo jsonb null;

comment on column time_entries.source is 'Canale: app | web | qr | nfc | digital_badge';
comment on column time_entries.geo is 'JSON { lat, lon, accuracyM?, capturedAt? } opzionale';

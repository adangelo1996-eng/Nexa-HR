-- Rimozione tabella token badge NFC / wallet (funzionalità ritirata).
drop table if exists public.nfc_badge_tokens cascade;

comment on column public.time_entries.source is 'Canale: app | web | qr';

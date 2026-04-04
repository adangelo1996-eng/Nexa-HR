UPDATE public.users SET
  "avsNumber" = NULL,
  "taxCanton" = NULL,
  "taxMunicipality" = NULL,
  jurisdiction = 'IT',
  iban = 'IT08F0569605830200058533287',
  "bankName" = 'Banca Popolare di Sondrio',
  "bicSwift" = 'POSOIT22',
  phone = CASE WHEN phone LIKE '+41%' THEN '+39 02 0000 0000' ELSE phone END
WHERE regexp_replace(coalesce(iban, ''), '[[:space:]]', '', 'g') ~* '^ch[0-9]'
  AND lower(email) NOT IN ('giulia.ferrari@synapse.com', 'marco.bernasconi@synapse.com', 'elena.rossi@synapse.com', 'luca.colombo@synapse.com', 'sofia.marini@synapse.com', 'andrea.greco@synapse.com', 'chiara.fontana@synapse.com', 'davide.serra@synapse.com', 'francesca.vitale@synapse.com', 'matteo.caruso@synapse.com', 'valentina.pellegrini@synapse.com', 'alessandro.deluca@synapse.com', 'ilaria.romano@synapse.com', 'paolo.bianco@synapse.com', 'nadia.costa@synapse.com', 'giorgio.leone@synapse.com', 'beatrice.galliani@synapse.com', 'simone.parisi@synapse.com', 'teresa.mancini@synapse.com', 'riccardo.fabbri@synapse.com');
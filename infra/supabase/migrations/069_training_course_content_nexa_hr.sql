-- Contenuto corsi multi-modulo + corso obbligatorio piattaforma Nexa HR

alter table public.training_courses
  add column if not exists course_content jsonb not null default '[]'::jsonb;

-- Corso piattaforma (obbligatorio) con moduli operativi
insert into public.training_courses (
  company_id,
  code,
  title,
  description,
  category,
  duration_minutes,
  has_quiz_placeholder,
  course_content
)
values (
  'comp-1',
  'nexa-hr-piattaforma',
  'Nexa HR — Guida alla piattaforma',
  'Percorso guidato su timbratura, ferie, cedolini, sale riunioni, formazione e Nexa Guide.',
  'mandatory',
  45,
  false,
  $json$[
    {
      "id": "timbratura",
      "title": "Timbratura e presenze",
      "summary": "Registra entrate/uscite e consulta lo storico dalla sezione Presenze.",
      "steps": [
        "Apri Presenze dal menu Io o dalla dashboard.",
        "Usa Avvia timbratura / Termina per segnare ingresso e uscita.",
        "In caso di dimenticanza, apri una richiesta di rettifica dal Workflow."
      ]
    },
    {
      "id": "ferie",
      "title": "Ferie e assenze",
      "summary": "Richiedi ferie, permessi o assenze e segui lo stato di approvazione.",
      "steps": [
        "Da Workflow crea una nuova richiesta (ferie, permesso, malattia).",
        "Verifica il calendario lavoro per sovrapposizioni con il team.",
        "Ricevi notifica quando HR o il manager approva o rifiuta."
      ]
    },
    {
      "id": "cedolini",
      "title": "Cedolini",
      "summary": "Consulta i documenti retributivi pubblicati da HR.",
      "steps": [
        "Vai a Documenti → Cedolini (o hub Documenti).",
        "Apri il mese di interesse e scarica il PDF se consentito.",
        "Segnala anomalie al referente HR, non via chat informale."
      ]
    },
    {
      "id": "sale-riunioni",
      "title": "Sale riunioni",
      "summary": "Prenota sale meeting con disponibilità in tempo reale.",
      "steps": [
        "Apri Sale riunioni dal menu Io.",
        "Scegli data, fascia oraria e sala disponibile.",
        "Conferma: riceverai promemoria e potrai modificare fino alla scadenza policy."
      ]
    },
    {
      "id": "formazione",
      "title": "Formazione",
      "summary": "Completa i corsi assegnati da HR entro la scadenza.",
      "steps": [
        "Percorso → Formazione elenca obbligatori e facoltativi.",
        "Segna Inizia quando apri il materiale; Completa al termine.",
        "Controlla la barra di avanzamento e le scadenze in evidenza."
      ]
    },
    {
      "id": "nexa-guide",
      "title": "Nexa Guide",
      "summary": "Assistente contestuale per domande su policy e percorsi del portale.",
      "steps": [
        "Apri Nexa Guide dall’icona in basso a destra.",
        "Formula domande operative (es. come richiedere ferie).",
        "Per temi legali o contrattuali rivolgiti sempre a HR."
      ]
    }
  ]$json$::jsonb
)
on conflict (company_id, code) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  duration_minutes = excluded.duration_minutes,
  has_quiz_placeholder = excluded.has_quiz_placeholder,
  course_content = excluded.course_content,
  active = true;

notify pgrst, 'reload schema';

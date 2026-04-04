# Calcolo del cedolino paga in Italia (aggiornato alle regole 2025‑2026)

## Executive summary

Questo report descrive in modo sistematico tutti i passaggi logici e i dati necessari per calcolare un cedolino paga italiano per lavoratori dipendenti del settore privato, con riferimento al quadro normativo 2025‑2026 (IRPEF a tre scaglioni, nuove detrazioni lavoro dipendente, trattamento integrativo, fringe benefit, TFR, principali tutele INPS). Il documento è pensato come base per progettare un motore di calcolo payroll o addestrare un agente AI che generi e verifichi buste paga “da zero a 100”.[^1][^2][^3][^4][^5]

Vengono definiti:
- modello dati del lavoratore e del rapporto di lavoro;
- struttura logica del cedolino (sezioni e voci);
- algoritmo di calcolo mensile lordo→netto→costo azienda;
- gestione di mensilità aggiuntive, TFR e ratei;
- principali casistiche particolari (part‑time, straordinari, malattia, maternità, infortunio, CIG, fringe benefit, bonus, conguagli fiscali e contributivi).[^6][^7][^1]

***

## 1. Quadro normativo di riferimento

### 1.1 Fonti principali

Per il calcolo del cedolino paga rilevano, tra l’altro:
- TUIR (DPR 917/1986), in particolare art. 11 (IRPEF e scaglioni), art. 13 (detrazioni lavoro dipendente) e art. 51 (determinazione reddito di lavoro dipendente e fringe benefit).[^3][^5][^7]
- Legge di Bilancio 2025 (L. 207/2024) e circolare Agenzia Entrate 4/E/2025, che rendono strutturale la riduzione degli scaglioni IRPEF a tre aliquote (23‑35‑43%) e innalzano la detrazione lavoro dipendente per redditi fino a 15.000 euro a 1.955 euro.[^8][^9][^3]
- Normativa INPS (circolari annuali) su aliquote contributive per lavoratori dipendenti al FPLD (33% complessivo, 23,81% datore e 9,19% lavoratore) e gestione separata / altre gestioni.[^10][^11]
- L. 4/1953 (obbligo di consegna del prospetto paga).[^4]
- L. 297/1982 e norme sul TFR (trattamento di fine rapporto).
- Normativa su Assegno Unico Universale (AUU) e relativi messaggi INPS (anche se l’AUU viene pagato direttamente da INPS e non transita più stipendiariamente in busta paga).[^12][^13]
- Decreti su Cassa Integrazione Guadagni (D.Lgs. 148/2015) e prassi INPS (CIGO, CIGS, FIS).[^14]
- Circolari e prassi su malattia, maternità, infortunio, fringe benefit e trattamento integrativo.[^5][^15][^16][^17][^18]

### 1.2 IRPEF 2025‑2026

Dal 2024 e in via strutturale dal 2025 l’IRPEF è calcolata con tre scaglioni:[^2][^3][^8]

- fino a 28.000 euro: 23%;
- oltre 28.000 e fino a 50.000 euro: 35%;
- oltre 50.000 euro: 43%.

La struttura a tre aliquote si applica ai redditi complessivi delle persone fisiche, inclusi i redditi di lavoro dipendente.[^3][^8]

### 1.3 Detrazioni per lavoro dipendente (art. 13 TUIR)

Dal 2025 la detrazione massima per lavoro dipendente è portata a 1.955 euro per redditi fino a 15.000 euro, con minimi garantiti di 690 euro (tempo indeterminato) e 1.380 euro (tempo determinato).[^9][^19][^5]

La struttura generale è:
- fino a 15.000 euro: detrazione fissa 1.955 euro, con minimo garantito 690/1.380 euro;
- tra 15.000 e 28.000 euro: detrazione calcolata con formula decrescente a partire da 1.910 euro;
- tra 28.000 e 50.000 euro: ulteriore formula decrescente;
- oltre 50.000 euro: detrazione azzerata.[^20][^21][^5]

La detrazione si rapporta ai giorni di lavoro nell’anno (compresi sabati, domeniche e festivi ricompresi nel rapporto) e viene applicata pro‑quota in busta paga con conguaglio a fine anno.[^21][^1]

### 1.4 Trattamento integrativo (ex bonus Renzi)

Il trattamento integrativo resta pari a un massimo di 1.200 euro annui (100 euro mensili) ed è riconosciuto ai lavoratori dipendenti con reddito complessivo fino a 15.000 euro, a condizione che l’IRPEF lorda superi la detrazione per lavoro dipendente.[^17][^22][^18]

Per redditi tra 15.000 e 28.000 euro l’accesso è possibile solo se alcune detrazioni (per lavoro, carichi di famiglia, oneri) superano l’imposta lorda: in questo caso l’importo del trattamento integrativo è pari alla differenza, fino a un massimo di 1.200 euro.[^23][^17]

### 1.5 Fringe benefit 2025‑2027

Per il triennio 2025‑2027 la soglia esente da IRPEF e contributi dei fringe benefit ex art. 51, comma 3, TUIR è confermata a:
- 1.000 euro annui per tutti i lavoratori dipendenti;
- 2.000 euro annui per i dipendenti con figli fiscalmente a carico.[^16][^7][^24]

Entro tali limiti, i beni e servizi qualificati come fringe benefit non concorrono né al reddito imponibile né all’imponibile contributivo; oltre soglia, l’intero importo diventa imponibile (non solo la parte eccedente, salvo eventuali future modifiche).[^24][^16]

### 1.6 Contributi INPS lavoratori dipendenti

Per il 2025 l’aliquota al Fondo Pensioni Lavoratori Dipendenti (FPLD) resta complessivamente al 33% della retribuzione imponibile, di cui 23,81% a carico datore di lavoro e 9,19% a carico del lavoratore, salvo aliquote specifiche per particolari settori o fondi.[^10]

Esistono addizionali per NASpI, fondi di solidarietà bilaterali, CIG, fondi sanitari e di previdenza complementare, che variano per settore e CCNL e devono essere parametrizzati nel motore di calcolo.[^25][^10]

### 1.7 TFR (Trattamento di Fine Rapporto)

Il TFR si matura annualmente nella misura pari a circa retribuzione annua / 13,5, con accantonamento figurativo in azienda o destinazione a forme pensionistiche complementari.[^26][^27]

Il fondo TFR accantonato al 31 dicembre di ogni anno è rivalutato applicando un tasso composto da una quota fissa dell’1,5% e dal 75% dell’aumento dell’indice ISTAT FOI (famiglie di operai e impiegati) rispetto a dicembre dell’anno precedente.[^15][^27][^28]

***

## 2. Modello dati per il calcolo del cedolino

### 2.1 Dati anagrafici del lavoratore

Per ciascun lavoratore il sistema deve memorizzare almeno:
- codice fiscale, dati anagrafici, residenza, domicilio fiscale (rilevante per addizionali regionali/comunali);
- stato civile e presenza di coniuge/figli a carico ai fini detrazioni per carichi di famiglia e soglie fringe benefit;
- eventuale disabilità, categorie protette, pignoramenti o cessioni del quinto (per trattenute ulteriori).

Questi dati sono necessari per calcolare correttamente IRPEF, detrazioni, addizionali e benefici accessori.[^1][^4]

### 2.2 Dati contrattuali e retributivi base

Per ogni rapporto di lavoro subordinato servono almeno:
- tipologia di contratto (tempo indeterminato, determinato, apprendistato, part‑time orizzontale/verticale/misto, dirigente, domestico, ecc.);
- CCNL applicato, livello/qualifica, categoria legale (operaio, impiegato, quadro, dirigente);
- RAL (retribuzione annua lorda teorica) e relative mensilità (12, 13, 14);
- orario contrattuale (es. 40 ore settimanali su 5 giorni, 36 ore, ecc.) e calendario aziendale;
- eventuali superminimi individuali, indennità di funzione, indennità di cassa, indennità turni, lavoro notturno/festivo, premi fissi, benefit;
- percentuali e regole per straordinari (CCNL: maggiorazioni orarie per straordinario feriale, festivo, notturno, ecc.).

Il motore deve poter derivare da questi dati:
- retribuzione base mensile teorica;
- valore orario ordinario e orario di straordinario per ciascuna casistica (feriale, festivo, notturno ecc.).[^1]

### 2.3 Dati mensili di input (per ogni cedolino)

Per ciascun mese vanno raccolti:
- ore lavorate ordinarie;
- ore di straordinario per tipologia (feriale, notturno, festivo);
- assenze retribuite (ferie, permessi ROL, ex festività, banca ore);
- assenze non retribuite (permessi non retribuiti, sciopero, aspettativa);
- eventi coperti da INPS/INAIL (malattia, maternità/paternità, congedi parentali, infortunio, CIG);
- premi variabili, bonus, provvigioni, indennità occasionali;
- fringe benefit erogati nel mese (es. buoni carburante, buoni spesa, auto aziendale ad uso promiscuo, alloggio, prestiti agevolati);
- rimborsi spese (a piè di lista o forfettari) con distinzione tra imponibili o esenti;
- eventuali conguagli (IRPEF, addizionali, TFR anticipi, arretrati di anni precedenti, AUU conguagliato).

Questi input alimentano il calcolo delle competenze lorde, degli imponibili e delle trattenute.[^6][^1]

***

## 3. Struttura logica del cedolino

Un cedolino “standard” può essere modellato in blocchi logici:

1. **Testata**: dati azienda, lavoratore, periodo, CCNL, qualifica, livello, matricola, data assunzione, centro di costo.
2. **Corpo – competenze**: tutte le voci positive (retribuzione base, contingenza, superminimi, scatti, indennità, straordinari, premi, ratei 13a/14a, ecc.).
3. **Corpo – trattenute previdenziali**: contributi INPS a carico lavoratore, eventuali contributi a fondi pensione, sanità integrativa.
4. **Corpo – trattenute fiscali**: IRPEF lorda, detrazioni, IRPEF netta, addizionali regionali/comunali, trattamento integrativo.
5. **Altre trattenute**: sindacato, cessioni/pignoramenti, prestiti, mensa, benefit a conguaglio.
6. **Piede del cedolino**: netto in busta, netto da pagare, TFR maturato, ratei ferie/ROL, totale costo azienda.[^4][^1]

Il motore AI deve gestire ciascuna voce come oggetto con attributi (tipo: competenza/trattenuta; imponibile previdenziale; imponibile fiscale; esente; ricorrente/una tantum; base di calcolo; aliquote e formule).[^1]

***

## 4. Algoritmo base lordo → netto (caso standard)

### 4.1 Passo 1 – Calcolo competenze lorde

Per un mese “normale” (senza eventi particolari) si procede così:

1. Calcolare la retribuzione mensile teorica: ad esempio RAL/13 o RAL/14 a seconda delle mensilità contrattuali.[^1]
2. Adeguare la retribuzione mensile alle giornate/ore lavorate, tenendo conto di assunzioni/cessazioni in corso di mese e di assenze non retribuite.
3. Aggiungere eventuali voci fisse: superminimi, indennità fisse, indennità di funzione, elemento distinto della retribuzione (EDR), ecc.
4. Calcolare lo straordinario: per ogni tipologia, moltiplicare ore straordinarie per la paga oraria ordinaria maggiorata (ad es. 15%, 30%, 50% in base a CCNL).[^1]
5. Aggiungere premi variabili, provvigioni, indennità occasionali (trasferta, disagio, reperibilità) secondo le regole di imponibilità.
6. Calcolare la quota mensile delle mensilità aggiuntive, se il CCNL prevede rateizzazione in 12 mensilità (altrimenti tali competenze saranno concentrate su 13a e 14a).[^4][^1]

Il risultato è la **retribuzione lorda del mese**, distinta per voci.

### 4.2 Passo 2 – Imponibile previdenziale e contributi INPS

L’imponibile previdenziale si ottiene sommando tutte le voci soggette a contribuzione INPS (retribuzione ordinaria, straordinari, premi, indennità imponibili, ratei mensilità aggiuntive, fringe benefit oltre soglia, ecc.), escludendo le voci esenti (rimborsi spese documentati, fringe benefit entro soglia, TFR, AUU, ecc.).[^16][^24][^10]

Su tale imponibile si applicano le aliquote contributive:
- 9,19% a carico del lavoratore (IVS ordinaria per dipendenti FPLD);
- 23,81% a carico del datore, al netto di eventuali riduzioni/esoneri di legge (es. bonus madri, sgravi contributivi).[^29][^30][^10]

Il sistema deve consentire, per ogni voce, la definizione di flag:
- “soggetta a INPS” sì/no;
- aliquota speciale o ordinaria;
- plafond/contribuzione massimale (massimali contributivi, tetti retributivi).

L’importo dei contributi a carico del lavoratore sarà riportato tra le trattenute in busta paga e ridurrà l’imponibile fiscale.[^6]

### 4.3 Passo 3 – Imponibile fiscale

L’imponibile fiscale IRPEF è dato dall’imponibile previdenziale al netto dei contributi obbligatori a carico del lavoratore (INPS, casse professionali), più eventuali voci soggette a sola IRPEF e non a contributi (ad esempio alcuni arretrati, conguagli, fringe benefit tassati). Sono escluse dal reddito imponibile, entro certi limiti, le somme per previdenza complementare e assistenza sanitaria integrativa entro i tetti di esenzione previsti dall’art. 51 TUIR.[^7][^4]

Nel motore è utile distinguere tre basi imponibili per ogni voce:
- imponibile INPS;
- imponibile IRPEF;
- esente.

### 4.4 Passo 4 – Calcolo IRPEF lorda annua stimata

In un motore di buste paga professionale l’IRPEF si calcola in via **progressiva annuale** con rateizzazione mensile e conguagli di fine anno, non come semplice aliquota sul mese.[^4][^1]

L’approccio tipico è:

1. Stimare o tenere aggiornato il **reddito imponibile annuo** previsto (in base a RAL, ore, straordinari stimati, ecc.).
2. Applicare gli scaglioni IRPEF annui:
   - 23% fino a 28.000 euro;
   - 35% oltre 28.000 e fino a 50.000 euro;
   - 43% oltre 50.000 euro.[^2][^8][^3]
3. Ottenere l’IRPEF lorda annua teorica.
4. Ripartire questa IRPEF annua su 12 (o 13/14) mensilità, aggiornando l’aliquota “media di periodo” quando cambia la previsione di reddito (premi, passaggi di livello, ecc.) e recuperando le differenze nei conguagli.

In alternativa, alcuni software ricalcolano mensilmente l’IRPEF su base “progressivo da inizio anno”, confrontando l’imposta dovuta sul reddito cumulato con quanto già trattenuto nei mesi precedenti e addebitando in cedolino la differenza.[^1]

### 4.5 Passo 5 – Calcolo delle detrazioni lavoro dipendente

La detrazione da lavoro dipendente si calcola, su base annua, in funzione del reddito complessivo e poi si ripartisce sul numero di giorni di lavoro nell’anno.[^5][^21][^1]

Schema semplificato (importi 2025):[^19][^9][^5]

- Reddito fino a 15.000 euro: detrazione annua 1.955 euro (minimo garantito 690 euro per tempo indeterminato, 1.380 euro per tempo determinato).
- Reddito tra 15.000 e 28.000 euro: detrazione = 1.910 + 1.190 × [(28.000 − reddito complessivo) / 13.000].
- Reddito tra 28.000 e 50.000 euro: formula decrescente con detrazione che tende a 0.
- Oltre 50.000 euro: detrazione nulla.

L’importo effettivo è poi moltiplicato per (giorni lavorati nell’anno / 365) e mensilizzato.[^21][^1]

### 4.6 Passo 6 – Calcolo trattamento integrativo

Sul reddito annuo stimato e sulla base dell’IRPEF lorda e delle detrazioni si verifica se spetta il trattamento integrativo:[^22][^18][^17]

- Redditi tra 8.500 e 15.000 euro: spetta il trattamento integrativo pieno 1.200 euro annui, se l’IRPEF lorda supera la detrazione per lavoro dipendente.[^23]
- Redditi tra 15.000 e 28.000 euro: spetta un importo pari alla differenza tra detrazioni spettanti e imposta lorda, fino a massimo 1.200 euro annui.[^17][^23]
- Redditi oltre 28.000 euro: non spetta.

In busta paga la quota mensile viene esposta come voce di credito (es. “TIR” o “Trattamento integrativo art. 1 DL 3/2020”), che aumenta il netto senza generare imponibile.[^18]

### 4.7 Passo 7 – Addizionali regionali e comunali

Le addizionali IRPEF regionale e comunale sono calcolate sul reddito imponibile IRPEF dell’anno precedente e trattenute nell’anno successivo in un numero prefissato di rate (tipicamente da 9 a 11).[^6][^4]

Il motore deve quindi:
- leggere l’imponibile IRPEF dell’anno precedente (da CU o storico aziendale);
- applicare le aliquote della regione di residenza e del comune di domicilio fiscale per l’anno di riferimento (aliquote aggiornate da tabelle esterne);
- calcolare l’addizionale totale dovuta (regionale + comunale), suddividerla in rate mensili e gestire eventuali conguagli a fine anno o in caso di cessazione.[^6]

Le addizionali devono rispettare eventuali soglie di esenzione comunali e strutture progressive per scaglioni; per questo il motore AI deve caricare, per ogni anno, tabelle parametriche per tutti i comuni e le regioni.[^4][^6]

### 4.8 Passo 8 – Calcolo IRPEF netta mensile

Sintesi per ogni mese:

1. IRPEF teorica del mese (per proiezione annua o metodo progressivo).
2. Detrazioni per lavoro dipendente e per carichi di famiglia rapportate al mese.
3. Eventuale trattamento integrativo.
4. Aggiunta/sottrazione di addizionali regionali e comunali.
5. Conguagli IRPEF dell’anno in corso (per cambio reddito) o dell’anno precedente (derivanti da 730/Redditi PF).[^4][^6][^1]

Risultato: **imposta netta del mese**, positiva (trattenuta) o negativa (credito rimborsato in busta).

### 4.9 Passo 9 – Netto in busta e costo azienda

Il **netto in busta** è dato da:

- competenze lorde
- meno contributi INPS a carico del lavoratore
- meno IRPEF netta (al netto delle detrazioni e del trattamento integrativo)
- meno addizionali regionali/comunali
- meno altre trattenute (sindacali, pignoramenti, prestiti)
- più eventuali rimborsi spese esenti, crediti di imposta, AUU (se ancora transita) o altri crediti.

Il **costo azienda** per il mese include:
- retribuzione lorda;
- contributi INPS a carico datore (23,81% base, più addizionali specifiche);
- premi INAIL (aliquota settore produttivo);
- accantonamento TFR (quota azienda se non conferita a fondi);
- altri costi (fondi sanitari, previdenza complementare, welfare aziendale).[^27][^10]

***

## 5. Mensilità aggiuntive (13a, 14a) e ratei

### 5.1 Logica generale

La 13a e l’eventuale 14a mensilità si maturano mensilmente in base alle regole del CCNL e alle presenze del lavoratore; di norma un dodicesimo per ogni mese di servizio.[^4][^1]

Il motore deve gestire:
- accantonamento mensile dei ratei (numero di mesi maturati/anno);
- valorizzazione economica della quota maturata (in base alle voci retributive che vi concorrono: spesso paga base + contingenza + EDR + superminimi);
- erogazione della 13a/14a in uno specifico mese (dicembre/giugno o luglio), con tassazione come retribuzione ordinaria, salvo regimi agevolati per arretrati.

### 5.2 Esempio di modellazione dati

Per ogni lavoratore il sistema conserva:
- numero di ratei maturati per ciascuna mensilità aggiuntiva;
- valore economico unitario di un rateo (mensilità teorica / 12);
- regole di perdita/sospensione del rateo in caso di assenze (malattia, CIG, maternità possono essere neutre o riduttive secondo CCNL).[^4]

In busta paga “ordinaria” può essere mostrato solo il numero di ratei maturati; nella mensilità aggiuntiva viene esposta la competenza intera.

***

## 6. TFR: calcolo e contabilizzazione

### 6.1 Quota annua di TFR

La quota annua di TFR maturato è pari alla somma delle retribuzioni utili dell’anno divisa per 13,5, secondo le regole della L. 297/1982.[^26][^27]

Il motore distingue:
- TFR lasciato in azienda;
- TFR destinato a fondi pensione complementari (con relativo versamento).

### 6.2 Rivalutazione del fondo TFR

Ogni anno il fondo TFR accantonato al 31 dicembre dell’anno precedente viene rivalutato applicando:

- 1,5% fisso annuo;
- più il 75% dell’incremento dell’indice ISTAT FOI (famiglie operai/impiegati) rispetto a dicembre dell’anno precedente.[^28][^15][^27]

La rivalutazione è soggetta a imposta sostitutiva (attualmente 17%) trattenuta e versata dal datore.[^31][^28]

### 6.3 TFR in busta paga

Nel cedolino mensile di norma non si espone la quota TFR come importo pagato, ma:
- il TFR maturato nel mese (info o contabile);
- il fondo TFR accantonato complessivo.

In caso di cessazione del rapporto si calcola il TFR netto da liquidare, applicando tassazione separata sui montanti secondo le regole vigenti.[^26]

***

## 7. Fringe benefit e welfare aziendale

### 7.1 Soglie e regime fiscale

Dal 2025:
- fringe benefit complessivi fino a 1.000 euro annui (2.000 con figli fiscalmente a carico) sono esenti da IRPEF e INPS;
- oltre tali limiti, salvo specifiche deroghe, l’intero importo diventa imponibile.[^7][^24][^16]

Rientrano tra i fringe benefit: buoni spesa, buoni carburante, auto aziendale ad uso promiscuo, alloggio, prestiti agevolati, dispositivi elettronici concessi ad uso personale, rimborsi utenze, ecc.[^24][^7]

Il calcolo dell’imponibile di alcuni benefit (es. auto aziendale) segue regole specifiche basate sul valore convenzionale (tabelle ACI e percentuali di percorrenza privata).[^7]

### 7.2 Modellazione per un motore AI

Per ciascun benefit:
- definire la tipologia (buono, auto, alloggio, altro);
- definire il valore nominale e il valore imponibile (eventuale base convenzionale);
- marcare se concorre al plafond fringe benefit esente e se è soggetto a INPS/IRPEF oltre soglia.

Il motore deve mantenere il cumulato annuo di fringe benefit per verificare il superamento delle soglie e adeguare il trattamento fiscale nei mesi successivi, eventualmente trasformando a tassato anche quanto erogato in precedenza (recupero).[^16][^7]

***

## 8. Casistiche particolari di presenze ed eventi

### 8.1 Part‑time orizzontale/verticale/misto

La logica di base non cambia, ma:
- retribuzione teorica mensile è proporzionata all’orario contrattuale (es. 50% di un full‑time → 50% della paga base);
- i contributi e l’IRPEF sono calcolati sulle retribuzioni effettive;
- il motore deve considerare minimi contrattuali orari e regole di maturazione di ferie, ROL, 13a e TFR in proporzione alle ore lavorate.[^6]

### 8.2 Straordinari, notturno, festivo

Gli straordinari e il lavoro notturno/festivo sono valorizzati con maggiorazioni orarie definite dal CCNL (ad es. +15% per straordinario feriale, +30% festivo, +50% notturno).[^1]

Per ogni tipologia si definisce:
- base di calcolo (paga base + contingenza + EDR, ecc.);
- percentuale di maggiorazione;
- imponibilità contributiva e fiscale (di norma piena).[^6][^1]

### 8.3 Ferie, ROL, ex festività

Ferie e permessi retribuiti sono usualmente considerati come presenza lavorativa ai fini retributivi, contributivi e fiscali; il motore gestisce i giorni/ore maturati e utilizzati, con saldo residuo.

Le ferie non godute oltre i limiti di legge possono determinare obblighi contributivi e sanzionatori anche se non ancora fruite; un motore AI avanzato può calcolare alert su ferie accumulate.[^6]

### 8.4 Malattia

Per i lavoratori dipendenti del settore privato, l’indennità di malattia è in parte a carico INPS (anticipata in busta dal datore) e in parte a carico diretta del datore, con percentuali variabili per giorno e settore.[^32][^33]

In linea generale (semplificando per i casi più comuni):
- i primi 3 giorni sono spesso a carico del datore (carenza), con percentuali definite dal CCNL;
- dall’8° al 20° giorno INPS riconosce il 50% della retribuzione media globale giornaliera;
- dal 21° giorno la misura sale al 66,66%.[^32]

Il motore deve distinguere:
- quota INPS (esposta come “indennità malattia INPS” – imponibile fiscale ma non sempre imponibile contributivo);
- quota integrazione datore (imponibile previdenziale e fiscale);
- giorni di evento, carenza, eventuali ricadute entro 30 giorni.[^33][^32]

### 8.5 Maternità/paternità e congedi parentali

L’indennità di maternità/paternità obbligatoria è generalmente pari all’80% della retribuzione media, a carico INPS ma spesso anticipata in busta dal datore; alcuni CCNL prevedono integrazione al 100% per periodi definiti.[^33]

I congedi parentali sono indennizzati in misura inferiore e con limiti di età e durata; il motore deve gestire percentuali diverse di copertura e relative imponibilità.[^33]

### 8.6 Infortunio sul lavoro (INAIL)

Gli infortuni sul lavoro sono coperti da indennità INAIL con regole proprie (es. 60% dal 4° al 90° giorno, 75% oltre), spesso con integrazione del datore; le giornate di infortunio sono tutelate ai fini ferie, TFR, anzianità.[^34]

Il motore deve gestire:
- indennità INAIL (normalmente non imponibile ai fini contributivi);
- eventuale integrazione datore;
- coordinate con premi INAIL a carico azienda (calcolo non in cedolino ma nel costo azienda complessivo).[^34]

### 8.7 Cassa Integrazione Guadagni (CIGO/CIGS, FIS)

La CIG integra l’80% della retribuzione persa per le ore non lavorate, entro massimali mensili fissati e aggiornati periodicamente.[^35][^14]

In caso di CIG a zero ore o parziale:
- il motore calcola la retribuzione teorica piena;
- determina le ore non lavorate coperte da CIG;
- calcola l’indennità lorda di CIG (80% delle ore perse × retribuzione globale) e ne gestisce massimali e contributo addizionale a carico azienda;
- espone in busta quota INPS (CIG)

---

## References

1. [Come leggere la busta paga 2025: istruzioni e consigli - Fiscomania](https://fiscomania.com/busta-paga/) - Busta paga come strumento per il calcolo dello stipendio netto mensile partendo dal lordo. Oneri pre...

2. [Tassazione lavoro dipendente 2025: Nuovi scaglioni IRPEF](https://www.studiosime.it/2025/01/10/tassazione-irpef-2025-lavoro-dipendente/) - Nel 2025 cambiano gli scaglioni IRPEF per la tassazione del lavoro dipendente. Cosa cambia per la bu...

3. [Irpef 2025: le 3 aliquote e gli scaglioni - Iuraecon Advisors](https://www.iuraecon.it/irpef-2025-le-3-aliquote-e-gli-scaglioni/) - Irpef 2025: aliquote, scaglioni, detrazioni. Le novità recepite nei modelli dei dichiarativi 2025. N...

4. [Busta Paga 2025 Tassazione, Detrazioni e Esempi di ...](https://www.opendotcom.it/lavoro/buste-paga/) - Scopri le novità fiscali sulla busta paga 2025: IRPEF, detrazioni, esoneri e esempi di cedolino. Gui...

5. [Detrazioni lavoro dipendente 2025: novità e calcoli](https://appmynet.it/detrazioni-lavoro-dipendente/) - Scopri tutto sulle detrazioni per i lavoratori dipendenti 2025, con istruzioni pratiche per calcolar...

6. [Trattenute Buste Paga 2026: calcolo ed esempi pratici](https://centroservizimediterraneo.it/blog/buste-paga/trattenute-buste-paga/) - Trattenute buste paga: guida semplice per capire IRPEF, INPS, addizionali e TFR con esempi chiari e ...

7. [Fringe benefit 2026: soglie € 1.000 - € 2.000 guida - Fiscomania](https://fiscomania.com/fringe-benefit-guida/) - Fringe benefit 2026: scopri le soglie € 1.000-€ 2.000, come calcolare auto aziendali e prestiti agev...

8. [IRPEF 2025: le nuove aliquote :: Fondo pensione Priamo](https://www.fondopriamo.it/blog/priamo/irpef-2025) - In questo articolo illustreremo le nuove aliquote e gli scaglioni IRPEF confermati per il 2025 e i r...

9. [www.fiscoetasse.com › FISCO › Riforma fiscale 2023-2026](https://www.fiscoetasse.com/new-rassegna-stampa/1034-irpef-2025-le-3-aliquote-e-gli-scaglioni.html) - Irpef 2025: aliquote, scaglioni, detrazioni. Le novità recepite nei modelli dei dichiarativi 2025. N...

10. [Contributi INPS 2025: tutte le novità e le aliquote aggiornate](https://www.rwstudio.it/contributi-inps-2025/) - Scopri tutte le novità sui contributi INPS 2025: aliquote aggiornate per lavoratori dipendenti, auto...

11. [aliquote contributive su redditi e compensi per l'anno 2025](https://api.mysolution.it/lavoro/informazioni/news/2025/01/31/inps-aliquote-contributive-su-redditi-e-compensi-per-lanno-2025/) - Per i soggetti già pensionati o assicurati presso altre forme di previdenza obbligatorie, per l'anno...

12. [assegno unico 2025: cosa cambia per le aziende e i datori di ...](https://www.advicy.it/assegno-unico-2025-cosa-cambia-per-le-aziende-e-i-datori-di-lavoro/)

13. [Assegno unico 2025: cosa cambia per le aziende e i datori di ...](https://www.advicy.it/assegno-unico-2025-cosa-cambia-per-le-aziende-e-i-datori-di-lavoro-2/)

14. [Cassa Integrazione Guadagni Ordinaria](https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.50599.cassa-integrazione-guadagni-ordinaria.html) - Il trattamento si calcola tenendo conto dell'orario di ciascuna settimana indipendentemente dal peri...

15. [Calcolo Coefficiente di Rivalutazione del TFR (ultimo aggiornamento](https://www.avvocatoandreani.it/servizi/coefficienti-rivalutazione-tfr.php) - Calcolo del coefficiente di rivalutazione del TFR dal 1982 e ultimo coefficiente disponibile

16. [Esenzione Fringe Benefit, cosa cambia per il 2025 - Buoni Pasto](https://www.buoni-pasto.it/esenzione-fiscale-fringe-benefit-novita/) - Scopri tutte le novità sull'esenzione fringe benefit nel 2025, una guida completa per aziende e dipe...

17. [Trattamento integrativo 2025 INPS: bonus 100 euro in busta paga](https://www.dequo.it/articoli/trattamento-integrativo) - A chi spetta il trattamento integrativo? A quali condizioni è erogato? Scopri quali sono i requisiti...

18. [Trattamento Integrativo 2025: Bonus IRPEF in Busta Paga](https://www.consulentedellavoro.it/trattamento-integrativo/) - Scopri cos’è il trattamento integrativo 2025, chi ne ha diritto, come funziona e come viene calcolat...

19. [Dipendenti, guida alle detrazioni 2025 sui redditi da lavoro](https://corrieregrossetano.it/italia-mondo/facilitalia/dipendenti-guida-alle-detrazioni-2025-sui-redditi-da-lavoro/) - Non solo taglio del cuneo fiscale e trattamento integrativo

20. [Aliquote e scaglioni IRPEF 2025 - Regimeminimi.com](https://www.regimeminimi.com/aliquote-e-scaglioni-irpef-2025/) - L’IRPEF 2025 si conferma al centro della riforma fiscale, con un sistema a tre aliquote e tre scagli...

21. [Detrazioni lavoro dipendente e d'imposta. - Randstad](https://www.randstad.it/blog-e-news/diritti-dei-lavoratori/calcolo-detrazioni-lavoro-dipendente/) - Scopri cosa sono, come si calcolano e quali sono le modalità per richiedere le detrazioni per reddit...

22. [Trattamento integrativo 2025: requisiti, importo e come averlo](https://www.idealista.it/news/finanza/fisco/2025/04/23/229505-trattamento-integrativo-2025-requisiti-importo-e-come-averlo) - Tra i diversi provvedimenti contenuti nella legge di bilancio votata a fine 2024, troviamo anche il ...

23. [Trattamento integrativo 2025 (ex bonus Renzi): cos'è e a chi spetta](https://www.jethr.com/risorse/trattamento-integrativo-2025/) - Trattamento integrativo 2025: il bonus che può arrivare fino a 1.200€ all'anno per i lavoratori con ...

24. [Fringe benefit: regole e novità 2025 | Sabatino Tax Work](https://www.sabatinotax-work.com/ultime-news/fringe-benefit-regole-e-novita-2025) - Nella legge di bilancio 2024, è stata prevista una nuova disciplina relativa ai fringe benefits ovve...

25. [Computo dei dipendenti ai fini della Cassa Integrazione Guadagni ...](https://www.sistemiamolitalia.it/computo-dei-dipendenti-ai-fini-della-cassa-integrazione-guadagni-ordinaria/) - Contribuzione ordinaria e addizionale nella CIGO · 1,70% della retribuzione imponibile ai fini previ...

26. [TFR: cos'è e come si calcola il trattamento di fine rapporto?](https://www.personio.it/glossario/tfr/) - Cos'è il TFR (trattamento di fine rapporto)? ✓ come si matura il TFR? ✓ quando si può richiedere il ...

27. [TRATTAMENTO DI FINE RAPPORTO | JobDrive - Consulente del Lavoro ...](https://www.jobdrive.it/amministrazione-del-personale/trattamento-di-fine-rapporto/) - Il Tfr, ossia il trattamento di fine rapporto, viene erogato in tutti i casi di cessazione del rappo...

28. [[PDF] La rivalutazione del TFR | Assolombarda](https://www.assolombarda.it/servizi/fisco/documenti/la-rivalutazione-del-tfr)

29. [Esonero contributivo lavoratrici madri: esempi di calcolo ...](https://www.studiomarchetti.net/it/news/2025-01-13-esonero-contributivo-lavoratrici-madri-esempi-calcolo-elaborazione-busta-paga/) - La legge di Bilancio 2025 (legge n. 207/2024) ha confermato l’applicazione della misura di riduzione...

30. [Esonero contributivo lavoratrici madri: esempi di calcolo per l ...](https://www.fondounihelse.it/2025/01/13/esonero-contributivo-lavoratrici-madri-esempi-di-calcolo-per-lelaborazione-della-busta-paga/)

31. [Lavoro, Ecco I coefficienti di rivalutazione del trattamento di fine ...](https://www.pensionioggi.it/notizie/economia/lavoro-il-tfr-di-luglio-raggiunge-quota-1-39-98789798789/index.php?option=com_k2&view=item&id=33473%3Ai-coefficienti-di-rivalutazione-del-trattamento-di-fine-rapporto-9878979&Itemid=904&amp=1) - Lavoro, Ecco I coefficienti di rivalutazione del trattamento di fine rapporto Valerio Damiani Gioved...

32. [Prestazioni economiche di malattia INPS - ITAL UIL](https://www.italuil.it/jsps/216/Attivita/221/Sanita_e_malattia/251/Prestazioni_economiche_di_malattia_INPS.jsp) - I primi 3 giorni di malattia (carenza) non sono indennizzabili, tranne nel caso di ricaduta della st...

33. [[PDF] Tutela previdenziale della malattia - Pagamento dell'indennità ...](https://www.inps.it/content/dam/inps-site/pdf/inpscomunica/documents/Guida_tutela_previdenziale_malattia.pdf) - Di solito, l'indennità è anticipata dal datore di lavoro nella busta paga, per conto dell'INPS. Tutt...

34. [[PDF] In caso di malattia o infortunio… cosa succede? - Cittadinanza Attiva](https://www.cittadinanzattiva.it/multimedia/import/files/primo_piano/consumatori/Tutele_in_caso_di_malattia_o_infortunio.pdf) - alla Gestione separata e per i quali si versa un contributo pari allo 0,72% della retribuzione impon...

35. [Cassa integrazione ordinaria: cos'è e come funziona?](https://www.jethr.com/risorse/cassa-integrazione-ordinaria-cose-e-come-funziona/) - L'INPS paga l'80% della retribuzione globale che sarebbe spettata al lavoratore per le ore di lavoro...


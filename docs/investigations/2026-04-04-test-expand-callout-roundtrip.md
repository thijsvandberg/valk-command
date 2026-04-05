# Test: Expand block met callouts — heen/weer naar Jira

Voer deze test volledig zelfstandig uit. Gebruik de browser (Chrome extensie tools) en het filesystem. Rapporteer elke stap visueel met een screenshot en geef aan het einde een duidelijk PASS / FAIL oordeel per testcase.

---

## Context

In `src/components/rich-editor/callout-markdown.ts`, `src/components/ticket-detail/renderMarkdown.tsx` en `src/lib/markdown-to-adf.ts` is een fix doorgevoerd voor geneste `:::` fence-blocks. Callout-blokken (:::note, :::info, :::warning, etc.) die **inside** een expand-blok (:::expand) zitten, moeten:

1. Correct gerenderd worden in de read-only viewer (binnen de expand)
2. Correct bewaard blijven na rich-text round-trip (open editor → sluit editor zonder aanpassen → viewer toont ze nog steeds inside)
3. Correct naar Jira gestuurd worden via "Push to Jira" (Jira toont callouts inside de expand)

Ticket om op te testen: **http://localhost:3100/tickets/VPL-1337**

---

## Voorbereiding

1. Navigeer naar http://localhost:3100/tickets/VPL-1337
2. Maak een screenshot van de pagina.
3. Klik op de "Title" expand block om hem open te klappen.
4. Scroll naar beneden en verifieer dat callout-blokken (NOTE, INFO, WARNING, SUCCESS, ERROR) **inside** de expand container zichtbaar zijn, niet erbuiten.
5. Screenshot als bewijs.

---

## Testcase 1 — Viewer rendert callouts correct inside expand

**Verwacht:** Alle callout-blokken staan visueel binnen de expand container (zichtbaar door de border/achtergrond van de expand block).

- Maak een screenshot van het volledige open expand-blok met de callouts.
- PASS als alle callouts inside de expand-border vallen.
- FAIL als een callout buiten de expand-border verschijnt.

---

## Testcase 2 — Rich-text round-trip bewaart structuur

**Stappen:**

1. Klik op de description om de editor te openen (rich text modus).
2. Maak een screenshot van de editor met het open expand-blok. Verifieer dat de callouts inside de expand staan in de editor.
3. Schakel naar **Markdown** modus (knop rechtsboven in de editor).
4. Lees de volledige textarea via `document.querySelector('textarea')?.value` en verifieer:
   - Er is één `:::expand Title` opener.
   - De `:::note`, `:::info`, `:::warning`, `:::success`, `:::error` blokken staan **na** de `:::expand` opener en **voor** de afsluitende `:::` van de expand.
   - De afsluitende `:::` van de expand staat na alle callouts.
5. Schakel terug naar **Rich Text** modus.
6. Verifieer dat de callouts nog steeds inside de expand staan.
7. Klik **Discard** (geen opslaan nodig).
8. Verifieer in de viewer dat de callouts nog steeds inside staan.
9. Screenshot als bewijs.

PASS als structuur intact is in alle stappen.

---

## Testcase 3 — Opslaan bewaart structuur

**Stappen:**

1. Klik op de description om de editor te openen.
2. Zet de editor in **Rich Text** modus.
3. Klik ergens inside de expand block om de cursor te plaatsen (buiten de callouts, bijv. bij de "sdfdsf" tekst bovenaan de expand).
4. Voeg een kleine aanpassing toe: type een spatie en verwijder hem meteen (zodat de editor "dirty" wordt). Of verander de tekst "sdfdsf" naar "sdfdsf test" en weer terug.
5. Sla op met **Cmd+Enter** of de Save-knop.
6. Wacht tot de editor sluit en de viewer verschijnt.
7. Klik de expand open.
8. Scroll naar de callout-sectie.
9. Screenshot.

PASS als alle callouts nog inside de expand staan na opslaan.

---

## Testcase 4 — Push to Jira stuurt callouts inside expand

**Stappen:**

1. Klik op de description om de editor te openen.
2. Klik **Push to Jira** (groene knop rechtsboven).
3. Wacht op bevestiging dat de push gelukt is.
4. Navigeer naar de Jira-pagina van VPL-1337 (URL is te vinden in de app, of gebruik de externe link knop naast de ticket-titel).
5. Open de expand block in Jira.
6. Screenshot van Jira met de expand open.

PASS als in Jira de callout-blokken (Note, Info, Warning, Success, Error) **inside** de expand sectie staan.
FAIL als ze erbuiten vallen of helemaal ontbreken.

---

## Testcase 5 — Meerdere edits blijven stabiel (stress test)

Herhaal 3 keer:

1. Open editor in rich text modus.
2. Pas de tekst "sdfdsf" aan naar "edit N" (N = 1, 2, 3).
3. Sla op.
4. Verifieer in de viewer dat callouts nog inside expand staan.
5. Screenshot.

PASS als na alle 3 edits de callouts nog steeds correct inside staan.

---

## Eindrapportage

Geef per testcase een PASS of FAIL met de relevante screenshot als bewijs. Geef ook aan of de fix stabiel werkt of dat er nog problemen zijn.

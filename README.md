# Section Viewer

Kleine Web-App, die Kilometer und Höhenmeter einer Rad- oder Wandertour bis zu beliebigen Punkten anzeigt und daraus transparente Overlays für Videos (z. B. Premiere Pro) erzeugt. Alles läuft im Browser, ohne Build-Schritt und ohne Server-Logik.

## Funktionen

- **FIT- und GPX-Dateien** einlesen, per Ziehen auf die Seite oder Klick auf das Ablagefeld. Mehrere Dateien werden als Etappen einer Tour aneinandergehängt.
- **Übersicht** mit Distanz, Auf- und Abstieg, Fahr- und Gesamtzeit, je Etappe mit dem Höhenwert des Garmin-Geräts zum Vergleich.
- **Höhenmeter-Schwelle** gegen Messrauschen, wahlweise automatisch an den Garmin-Wert angepasst.
- **Tabelle der Werte bis zum jeweiligen Punkt**: Standard-Abschnitte (alle 5 bis 100 km) und eigene Punkte, angegeben als Kilometer (`12,5`), Zeit seit Start (`1:30:00`) oder Uhrzeit (`@14:35`); bei mehreren Etappen mit Tag (`3/45`, `3/@14:35`). Ein Klick ins Höhenprofil fügt ebenfalls einen Punkt hinzu.
- **Ortsnamen** über OpenStreetMap (Nominatim) abrufen und von Hand korrigieren.
- **Export** der Tabelle in die Zwischenablage oder als CSV.
- **Overlay für Videos**: Zähler, Mini-Karte und Höhenprofil als PNG-Sequenz (ZIP) oder Einzelbild, für 1080p oder 4K, mit Zeitraffer. Layout, Schrift, Farben und Karte lassen sich gestalten und als Vorlage (`.json`) speichern.
- **Story-Creator**: ein Bild der Tour oder des Laufs für Beiträge und Stories (9:16, 4:5, 1:1) mit Strecke, Höhenprofil, Titel, Datum und Kennzahlen. Hintergrund transparent (als Sticker), eigenes Foto (wird nur im Browser verarbeitet, auch per Ziehen auf die Seite) oder Farbe. Speichern als PNG oder auf dem Handy direkt teilen. Die Gestaltung wird je Sportart gemerkt.
- **Session speichern**: Dateien, eigene Punkte, Einstellungen und Ortsnamen in einer `_session.json` sichern. Um später oder auf einem anderen Gerät weiterzumachen, die Datei einfach auf die Seite ziehen.

- **Rad oder Lauf**: Umschalter oben rechts. Im Laufmodus zeigt die Seite Pace (min/km) statt km/h, Laufzeit statt Fahrzeit, Schritte pro Minute statt Kadenz, eine Spalte Split-Pace (Pace seit dem vorigen Tabellenpunkt) und Abschnitte ab 1 km, in eigenem Design. Dazu kommen Wettkampf-Marken (5 km, 10 km, Halbmarathon, Marathon), eine eigene Overlay-Gestaltung (Rad und Lauf merken sich ihre Gestaltung getrennt) und im Overlay eine über 15 s geglättete Pace. FIT- und GPX-Dateien, die ihre Sportart angeben, schalten beim Öffnen einer neuen Tour automatisch um; die Wahl wird gemerkt und in der Session gespeichert.

## Datenschutz

Die Aufzeichnungen werden nur lokal im Browser ausgewertet, nichts wird hochgeladen. Daten verlassen den Browser nur in zwei Fällen:

- „Orte abrufen“ sendet die Koordinaten der Tabellenpunkte an Nominatim.
- „Kartenhintergrund“ im Overlay lädt Kartenkacheln von OpenStreetMap.

Einstellungen, Ortsnamen und Markierungen merkt sich der Browser im `localStorage`. Session-Dateien enthalten die vollständigen Aufzeichnungen mit allen GPS-Daten.

Eigene Aufzeichnungen (`*.fit`, `*.gpx`) und Sessions (`*_session.json`) stehen in der `.gitignore` und werden zusätzlich per `.htaccess` nicht ausgeliefert.

## Lokal starten

Die Seite braucht nur einen einfachen Webserver, zum Beispiel:

```sh
python -m http.server 8000
```

Danach `http://localhost:8000` öffnen.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seite und Bedienelemente |
| `css/style.css` | Gestaltung, helles und dunkles Farbschema |
| `js/util.js` | Hilfsfunktionen (Formatierung, Download, Zwischenablage) |
| `js/parse.js` | Einlesen von FIT und GPX |
| `js/track.js` | Track aufbauen, Etappen verbinden, Höhenmeter und Tabellenpunkte berechnen |
| `js/view.js` | Übersicht, Höhenprofil, Tabelle, Ortsnamen, CSV |
| `js/overlay.js` | Overlay: Einstellungen, Vorlagen, Zeichnen, Vorschau |
| `js/overlay-export.js` | PNG- und ZIP-Export der Overlays |
| `js/postcard.js` | Story-Creator: Bild für Beiträge und Stories |
| `js/app.js` | Dateien laden, Session, Ereignisse |
| `.htaccess` | Zugriffsschutz und Caching auf dem Webspace |

## Deployment

Der Netcup-Webspace ist in Plesk per Git an dieses Repository angebunden. Ein Webhook von GitHub löst bei jedem Push auf `main` die Bereitstellung aus; der Stand liegt danach direkt im Webverzeichnis der Subdomain.

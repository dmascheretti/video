# VYRA One — spot 30" (sample)

Spot dimostrativo per il lancio di uno smartphone **inventato** (VYRA One): motion graphics 3D, tipografia cinetica, colonna sonora e sound design sincronizzati sul beat.
Tutto è generato da codice e riproducibile frame-per-frame.

Output: `vyra_one_spot_30s.mp4`, 1920×1080, 30 fps, H.264 + AAC, audio a −14 LUFS (standard web).

## Storyboard (120 BPM: 1 battuta = 2s, 15 battute)

| Tempo | Shot | Visual | Audio |
|---|---|---|---|
| 0–2s | **Hook** | Buio, una rim light corre sul profilo in titanio | Impatto + glitch, pad |
| 2–5s | **Reveal + brand** | Retro 3/4, si accende l'anello *Halo*. "Introducing VYRA One" (brand entro 5s, regola ABCD) | Entra il beat, chime sul nome |
| 5–9s | **Feature 1: design** | Orbit lento sul bordo, light sweep. "Titanium. Reimagined." | Whoosh sul taglio, aria |
| 9–13s | **Feature 2: camera** | Transizione con l'anello Halo, macro sulla lente, contatore 0→200MP, crash zoom dentro la lente | Hit, tick del contatore, riser |
| 13–17s | **Feature 3: display** | Unica rotazione "eroica" di 180°, lo schermo si accende. "6.9″ · 144Hz" | Boom + whoosh lungo, shimmer all'accensione |
| 17–20s | **Batteria / chip** | Barra di carica animata. "Two-day battery." | Sweep tonale sulla barra |
| 20–21.5s | **Colorways** | 3 tagli sul beat: Graphite / Glacier / Ember | Hit per taglio + riser |
| 21.5–22s | **Silenzio** | Nero | 0,5s di vuoto prima del drop |
| 22–25s | **Climax** | Lineup dei 3 telefoni, flash, particelle. "See beyond." | Impact + sub-drop + braam |
| 25–30s | **End card** | Logo con tracking, tagline, CTA "Pre-order now · 11.11" | Sonic logo a 3 note (E–A–C#), coda |

## Scelte dalla ricerca di mercato

**Visual.** Il modello di riferimento è Apple/Nothing: fondo nero, un solo soggetto, un solo accento colore e un *motivo-firma* preso dall'hardware, qui l'anello Halo usato anche come transizione. Samsung S25 Ultra punta su più testo e più grafica 2D, con energia più alta ma un messaggio più disperso. Pixel 10 è lifestyle e ironico, meno adatto a un reveal di prodotto.
- Movimenti di camera con easing esponenziale e mai lineari. Orbit di 30–60° per shot, una sola rotazione di 180° in 2,5s.
- Testo massimo 3–4 parole per schermata, mask reveal dal basso in circa 0,5s con stagger di 70ms. L'uscita è più veloce dell'entrata (0,25s con blur).
- Riflessi da un HDRI "softbox" a strisce verticali, bloom solo sulle luci forti, grana e vignettatura leggere.

**Audio / struttura.**
- 120 BPM, La minore (i–VI–III–VII), con risoluzione in La maggiore sul logo.
- Tagli sui downbeat. Riser + 0,5s di silenzio + impact sul climax.
- End card di 5s. Sonic logo ricorrente, perché secondo Ipsos/ARF i segnali sonori di brand rendono molto più probabile un'attenzione al brand alta.
- Messaggio leggibile anche senza audio: tutti i claim sono in sovrimpressione.

**Formati consigliati per la campagna.**
- 16:9 (questo master) per TV e YouTube.
- 9:16 ricomposto per Reels/TikTok/Shorts: prodotto centrale, testi fuori dalle safe area.
- Cutdown da 15s (hook, 2 feature, end card) e bumper da 6s.

Fonti principali: Google/Kantar ABCD, Ipsos/ARF Sonic Branding 2024, case study FutureDeluxe × Nothing Phone (3), BBH/The Mill × Galaxy S25 Ultra, Apple iPhone 17 Pro "Cinematic" e "Detectives".

## Come rigenerarlo

```bash
npm install                                     # three.js
node render.mjs frames 30 0 30 4                # 900 frame PNG (Chromium headless, WebGL)
python3 music.py music_raw.wav                  # colonna sonora procedurale
ffmpeg -i music_raw.wav -af loudnorm=I=-14:TP=-1 music.wav
ffmpeg -framerate 30 -i frames/f_%04d.png -i music.wav -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -shortest vyra_one_spot_30s.mp4
```

Anteprima live: servi la cartella con un server statico e apri `index.html`, poi da console usa `seek(t)`.

- `scene.js`: modello 3D procedurale, luci, post-processing, timeline degli shot e tipografia.
- `render.mjs`: render deterministico in parallelo.
- `music.py`: musica e SFX sintetizzati.

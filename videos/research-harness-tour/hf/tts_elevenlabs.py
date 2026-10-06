"""Vertont scenes.json mit ElevenLabs, eine WAV-Datei je Szene, und trägt die Dauer ein.

Neben jede Audiodatei legt es `audio/s<n>.json` mit den Zeitstempeln je Zeichen und je Wort
(Endpoint `with-timestamps`), dazu `transcript.json` mit allen Wörtern des Videos im Format der
HyperFrames-Untertitel. Daraus entstehen Untertitel und Szenenwechsel; das Audio ist die Uhr.

Der Schlüssel kommt aus der Keychain (Eintrag `elevenlabs`) und steht nie in einer Befehlszeile.

    python3 tts.py --list-voices          # Stimmen des Kontos mit ID
    python3 tts.py --voice <id> --dry-run  # zeigt, was vertont würde, und die Zeichenzahl
    python3 tts.py --voice <id>            # vertont, danach: python3 build.py && npx hyperframes render
    python3 tts.py --voice <id> --model eleven_v3  # anderes Modell, etwa für einen Hörvergleich
"""
import argparse, base64, json, os, subprocess, sys, urllib.request, urllib.error

API = "https://api.elevenlabs.io/v1"
MODEL = "eleven_v3"  # Hörvergleich 04.10.: auf Deutsch besser als eleven_multilingual_v2 (Daniel)
# Daniels Klon klingt nur mit v2 nach ihm (Daniel, 04.10.: v3 "klingt nicht nach mir"); Einstellungen aus Variante 4
CLONE = "ievot1Qdhr2rhgyi2h1Y"
CLONE_MODEL = "eleven_multilingual_v2"
CLONE_SETTINGS = {"stability": 0.6, "similarity_boost": 1.0, "style": 0.0, "use_speaker_boost": True}


def key():
    r = subprocess.run(["security", "find-generic-password", "-s", "elevenlabs", "-w"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("Kein Schlüssel in der Keychain (Eintrag 'elevenlabs').")
    return r.stdout.strip()


def call(path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None,
                                 headers={"xi-api-key": key(), "Content-Type": "application/json"},
                                 method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code}: {e.read()[:300].decode(errors='replace')}")


def words(al):
    """Fasst die Zeichen-Zeitstempel zu Wörtern zusammen: [{w, start, end}]."""
    out, cur = [], None
    for ch, t0, t1 in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]):
        if ch.isspace():
            cur = None
            continue
        if cur is None:
            cur = {"w": "", "start": t0, "end": t1}
            out.append(cur)
        cur["w"] += ch
        cur["end"] = t1
    return out


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice")
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--model", help=f"Standard: {MODEL}, für Daniels Klon {CLONE_MODEL}")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", type=int, action="append", help="nur diese Szene neu vertonen (mehrfach erlaubt)")
    a = ap.parse_args()

    if a.list_voices:
        for v in json.loads(call("/voices"))["voices"]:
            print(v["voice_id"], v.get("category", ""), v["name"])
        return
    if not a.voice:
        sys.exit("--voice <id> fehlt (IDs mit --list-voices).")

    if not a.model:
        a.model = CLONE_MODEL if a.voice == CLONE else MODEL

    scenes = json.load(open("scenes.json"))
    chars = sum(len(s["text"]) for s in scenes)
    print(f"{len(scenes)} Szenen, {chars} Zeichen, Modell {a.model}, Stimme {a.voice}")
    if a.only:
        chars = sum(len(scenes[n - 1]["text"]) for n in a.only)
        print(f"nur Szenen {a.only}: {chars} Zeichen")
    if a.dry_run:
        return
    os.makedirs("audio", exist_ok=True)

    for i, s in enumerate(scenes, 1):
        if a.only and i not in a.only:
            continue
        body = {"text": s["text"], "model_id": a.model}
        if a.voice == CLONE:
            body["voice_settings"] = CLONE_SETTINGS
        if a.model != "eleven_v3":  # v3 lehnt previous_text/next_text ab (400 unsupported_model, 04.10.2026)
            # Nachbarszenen als Kontext, damit Betonung und Tempo über Szenengrenzen gleich bleiben
            body["previous_text"] = scenes[i - 2]["text"] if i > 1 else None
            body["next_text"] = scenes[i]["text"] if i < len(scenes) else None
        mp3 = f"audio/s{i}.mp3"
        r = json.loads(call(f"/text-to-speech/{a.voice}/with-timestamps?output_format=mp3_44100_128", body))
        open(mp3, "wb").write(base64.b64decode(r["audio_base64"]))
        al = r.get("alignment") or {}
        json.dump({"text": s["text"], "model": a.model, "voice": a.voice, "alignment": al,
                   "words": words(al) if al else []},
                  open(f"audio/s{i}.json", "w"), indent=1, ensure_ascii=False)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "44100", f"audio/s{i}.wav"], check=True)
        s["dur"] = duration(f"audio/s{i}.wav")
        s["voice"] = a.voice
        print(f"Szene {i}: {s['dur']} s")
    json.dump(scenes, open("scenes.json", "w"), indent=1, ensure_ascii=False)
    transcript(scenes)


def transcript(scenes):
    """Schreibt transcript.json im Format der HyperFrames-Untertitel: alle Wörter des Videos als
    [{id, text, start, end}], Zeiten ab Videobeginn. Annahme: die Szenen folgen ohne Pause aufeinander
    (Startzeit = Summe der Dauern davor). Fügt build.py Pausen ein, stimmen die Zeiten danach nicht."""
    out, t0 = [], 0.0
    for i, s in enumerate(scenes, 1):
        for w in json.load(open(f"audio/s{i}.json"))["words"]:
            out.append({"id": f"w{len(out)}", "text": w["w"],
                        "start": round(t0 + w["start"], 3), "end": round(t0 + w["end"], 3)})
        t0 += s["dur"]
    json.dump(out, open("transcript.json", "w"), indent=1, ensure_ascii=False)
    print(f"transcript.json: {len(out)} Wörter, {round(t0, 2)} s")


if __name__ == "__main__":
    main()

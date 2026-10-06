"""Builds index.html from scenes.json. The voice sets each scene's length; reveals are pinned to the
word timestamps in audio/s<n>.json, so a re-voiced scene keeps its picture in sync.

Rough cut: every scene is typeset. UI scenes (2, 5, 8) will take frames from
scripts/capture-session-view.js once the accessible-UI lane reports "UI steht"."""
import json

sc = json.load(open('scenes.json'))
PAD = 0.7     # silence after each scene
LEAD = 0.3    # picture starts this much before the voice
starts, t = [], 0.0
for o in sc:
    starts.append(round(t, 2)); o['len'] = round(o['dur'] + LEAD + PAD, 2); t += o['len']
TOTAL = round(t, 2)
WORDS = [json.load(open(f'audio/s{i}.json'))['words'] for i in range(1, len(sc) + 1)]


def at(i, word, nth=1, fallback=0.0):
    """Absolute time at which scene i's voice says `word` (nth occurrence)."""
    k = 0
    for w in WORDS[i - 1]:
        if w['w'].strip('.,;:!?"“”').lower() == word.lower():
            k += 1
            if k == nth:
                return round(starts[i - 1] + LEAD + w['start'], 2)
    return round(starts[i - 1] + LEAD + fallback, 2)


css = '''
@font-face{font-family:'Hanken Grotesk';font-weight:400;src:url('fonts/hg-400.woff2') format('woff2')}
@font-face{font-family:'Hanken Grotesk';font-weight:600;src:url('fonts/hg-600.woff2') format('woff2')}
@font-face{font-family:'Hanken Grotesk';font-weight:800;src:url('fonts/hg-800.woff2') format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:500;src:url('fonts/jbm-500.woff2') format('woff2')}
:root{--bg:#ebf2eb;--surface:#fff;--ink:#193c31;--soft:#4d655a;--action:#154b38;--accent:#dbedb0;
--border:#cdddca;--sugg:#6b4c11;--sugg-bg:#f3ead9;--bad:#a2392f;--bad-bg:#f6dfdb;--warn:#8a5a00;--warn-bg:#fbeccb}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:var(--bg)}
body{font-family:'Hanken Grotesk',sans-serif;color:var(--ink)}
.scene{position:absolute;inset:0}
.abs{position:absolute}
.kicker{font-size:28px;letter-spacing:.16em;text-transform:uppercase;color:var(--action);font-weight:600}
.h1{font-size:100px;font-weight:800;line-height:1.02;letter-spacing:-.01em}
.h2{font-size:60px;font-weight:800;line-height:1.1}
.body{font-size:38px;line-height:1.35;color:var(--soft)}
.card{background:var(--surface);border:2px solid var(--border);border-radius:22px;padding:26px 34px;
 box-shadow:0 8px 24px rgba(25,60,49,.08);font-size:34px;line-height:1.35}
.mono{font-family:'JetBrains Mono',monospace;font-size:28px;line-height:1.5}
.term{background:#13231e;color:#dfeadd;border-radius:18px;padding:30px 36px;font-family:'JetBrains Mono',monospace;font-size:28px;line-height:1.55}
.term .p{color:#9fd3b4}
.pill{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:26px;padding:4px 14px;border-radius:999px;margin-right:16px;vertical-align:2px}
.prop{background:var(--sugg-bg);color:var(--sugg)}
.stat{background:#e3e8f6;color:#2c3f7a}
.acc{background:var(--accent);color:var(--action)}
.tag{display:inline-block;font-weight:600;font-size:26px;padding:8px 20px;border-radius:999px}
.ok{background:var(--accent);color:var(--action)}
.bad{background:var(--bad-bg);color:var(--bad)}
.warn{background:var(--warn-bg);color:var(--warn)}
.src{left:120px;bottom:54px;font-size:22px;color:var(--soft);max-width:1680px}
.foot{right:120px;bottom:54px;font-size:22px;color:var(--soft);letter-spacing:.08em;font-weight:600}
'''

body, anim = {}, {}

# 1 Opening
body[1] = '''<div id="s1-k" class="abs kicker" style="left:160px;top:200px">A paper project</div>
<div id="s1-a" class="abs card" style="left:160px;top:290px;width:480px">Framing A<br><span class="body" style="font-size:28px">agent draft</span></div>
<div id="s1-b" class="abs card" style="left:700px;top:290px;width:480px">Literature note<br><span class="body" style="font-size:28px">agent draft</span></div>
<div id="s1-c" class="abs card" style="left:1240px;top:290px;width:520px">Check questions<br><span class="body" style="font-size:28px">agent draft</span></div>
<div id="s1-q" class="abs h1" style="left:160px;top:600px">Who decided what?</div>'''
anim[1] = lambda s, L: [
    f'tl.from("#s1-k",{{opacity:0,duration:.5}},{s+0.2})',
    f'tl.from("#s1-a",{{opacity:0,y:40,duration:.6}},{at(1,"framings",fallback=3)})',
    f'tl.from("#s1-b",{{opacity:0,y:40,duration:.6}},{at(1,"literature",fallback=4)})',
    f'tl.from("#s1-c",{{opacity:0,y:40,duration:.6}},{at(1,"question",fallback=5)})',
    f'tl.from("#s1-q",{{opacity:0,y:30,duration:.8}},{at(1,"which",fallback=8)})']

# 2 Canvas
els = ['Puzzle', 'Audience & prior research', 'Research question', 'Constructs', 'Setting',
       'Design & analysis', 'Findings', 'Contributions', 'Boundary conditions']
grid = ''.join(f'<div id="s2-e{n}" class="abs card" style="left:{160+(n%3)*540}px;top:{170+(n//3)*120}px;width:500px;padding:18px 28px;font-size:30px;font-weight:600">'
               f'<span style="color:var(--soft);font-weight:400">{n+1}</span>&nbsp; {e}</div>' for n, e in enumerate(els))
body[2] = grid + '''<div id="s2-m" class="abs card mono" style="left:160px;top:560px;width:1600px">
<div id="s2-m1"><span class="pill prop">proposed</span>Developers treat assistant output as a draft to verify.</div>
<div id="s2-m2"><span class="pill stat">stated</span>"We only interviewed people with five or more years of experience."</div>
<div id="s2-m3"><span class="pill acc">accepted</span>The study asks how senior developers decide when to trust an assistant.</div></div>
<div id="s2-src" class="abs src">Dorobantu, Gruber, Ravasi &amp; Wellman (2024). The AMJ Management Research Canvas. <i>Academy of Management Journal</i>, 67(5), 1163–1174. doi:10.5465/amj.2024.4005</div>'''
anim[2] = lambda s, L: [
    f'tl.from([{",".join(chr(34)+"#s2-e"+str(n)+chr(34) for n in range(9))}],{{opacity:0,y:20,duration:.4,stagger:.18}},{at(2,"nine",fallback=3)-0.4})',
    f'tl.from("#s2-src",{{opacity:0,duration:.6}},{at(2,"AMJ",fallback=4)})',
    f'tl.to("#s2-src",{{opacity:0,duration:.6}},{at(2,"every",fallback=10)})',
    f'tl.from("#s2-m",{{opacity:0,y:30,duration:.6}},{at(2,"marker",fallback=10)})',
    f'tl.from("#s2-m1",{{opacity:0,x:-20,duration:.4}},{at(2,"proposed",fallback=11)})',
    f'tl.from("#s2-m2",{{opacity:0,x:-20,duration:.4}},{at(2,"stated",fallback=13)})',
    f'tl.from("#s2-m3",{{opacity:0,x:-20,duration:.4}},{at(2,"accepted",nth=2,fallback=15)})']

# 3 Accept
body[3] = '''<div id="s3-h" class="abs h2" style="left:160px;top:150px">Agents propose. <span style="color:var(--action)">Only you accept.</span></div>
<div id="s3-t" class="abs term" style="left:160px;top:300px;width:1600px"><span class="p">$</span> research-harness accept 3.1 --explained <span id="s3-x">"The interviews show trust is negotiated case by case."</span></div>
<div id="s3-log" class="abs card mono" style="left:160px;top:520px;width:1600px">research/decisions.md
<div id="s3-l1" style="margin-top:12px">#14 ACCEPT 3.1 · By: researcher <span class="tag ok" style="margin-left:20px">seal verifies</span></div>
<div id="s3-l2">#15 ACCEPT 4.2 · typed in by hand <span class="tag bad" style="margin-left:20px">does not verify</span></div></div>'''
anim[3] = lambda s, L: [
    f'tl.from("#s3-h",{{opacity:0,y:20,duration:.6}},{s+0.2})',
    f'tl.from("#s3-t",{{opacity:0,y:20,duration:.5}},{at(3,"sentence",fallback=4)-0.6})',
    f'tl.from("#s3-x",{{opacity:0,duration:.8}},{at(3,"sentence",fallback=4)})',
    f'tl.from("#s3-log",{{opacity:0,y:30,duration:.6}},{at(3,"log",fallback=7)})',
    f'tl.from("#s3-l1",{{opacity:0,duration:.5}},{at(3,"sealed",fallback=9)})',
    f'tl.from("#s3-l2",{{opacity:0,duration:.5}},{at(3,"hand",fallback=12)})']

# 4 Guardrail
body[4] = '''<div id="s4-t" class="abs term" style="left:160px;top:260px;width:1600px"><span style="color:#9aa">agent tool call</span><br><span class="p">$</span> research-harness accept 3.1 …<br><span id="s4-r" style="color:#f0a79c">refused: accepting is the researcher's decision</span></div>
<div id="s4-c" class="abs h2" style="left:160px;top:640px">A guardrail, <span style="color:var(--soft)">not a lock.</span></div>'''
anim[4] = lambda s, L: [
    f'tl.from("#s4-t",{{opacity:0,y:20,duration:.6}},{s+0.2})',
    f'tl.from("#s4-r",{{opacity:0,duration:.4}},{at(4,"refuses",fallback=2)})',
    f'tl.from("#s4-c",{{opacity:0,y:20,duration:.6}},{at(4,"guardrail",fallback=5)})']

# 5 Framings
fr = ['Sensemaking', 'Trust calibration', 'Boundary work']
body[5] = ''.join(f'<div id="s5-f{n}" class="abs card" style="left:{160+n*545}px;top:250px;width:505px;height:360px"><div class="kicker">Framing {"ABC"[n]}</div>'
                  f'<div class="h2" style="font-size:44px;margin-top:20px">{f}</div><div id="s5-r{n}" class="body" style="font-size:28px;margin-top:40px">'
                  f'{"<span class=&quot;tag ok&quot;>chosen</span>" if n==1 else "set aside: <i>reason recorded</i>"}</div></div>' for n, f in enumerate(fr))
body[5] = body[5].replace('&quot;', '"')
anim[5] = lambda s, L: [
    f'tl.from(["#s5-f0","#s5-f1","#s5-f2"],{{opacity:0,y:40,duration:.6,stagger:.25}},{s+0.3})',
    f'tl.from(["#s5-r0","#s5-r1","#s5-r2"],{{opacity:0,duration:.01}},{at(5,"pick",fallback=4)})',
    f'tl.to(["#s5-f0","#s5-f2"],{{opacity:.45,duration:.6}},{at(5,"others",fallback=5)})',
    f'tl.to("#s5-f1",{{borderColor:"#154b38",duration:.4}},{at(5,"pick",fallback=4)})']

# 6 Glossary
body[6] = '''<div id="s6-g" class="abs card" style="left:160px;top:200px;width:760px"><div class="kicker">research/glossary.md</div>
<div class="h2" style="font-size:44px;margin-top:16px">Trust calibration</div>
<div id="s6-d1" class="body" style="font-size:30px;margin-top:12px">Adjusting reliance on a tool to how reliable it is.</div>
<div id="s6-d2" class="body" style="font-size:30px;margin-top:-82px;color:var(--ink)">Matching reliance on output to evidence about that output.</div></div>
<div id="s6-c" class="abs card" style="left:1000px;top:200px;width:760px;font-size:30px">Canvas 4.1 cites <b>Trust calibration</b><br><span id="s6-c2" class="tag warn" style="margin-top:14px">stale</span></div>
<div id="s6-m" class="abs card" style="left:1000px;top:440px;width:760px;font-size:30px">Manuscript §2 cites <b>Trust calibration</b><br><span id="s6-m2" class="tag warn" style="margin-top:14px">stale</span></div>'''
anim[6] = lambda s, L: [
    f'tl.from("#s6-g",{{opacity:0,y:30,duration:.6}},{s+0.2})',
    f'tl.set("#s6-d2",{{opacity:0}},{s})',
    f'tl.from(["#s6-c","#s6-m"],{{opacity:0,x:40,duration:.6,stagger:.3}},{at(6,"cite",fallback=4)})',
    f'tl.set(["#s6-c2","#s6-m2"],{{opacity:0}},{s})',
    f'tl.to("#s6-d1",{{opacity:0,duration:.4}},{at(6,"changes",fallback=7)})',
    f'tl.to("#s6-d2",{{opacity:1,duration:.4}},{at(6,"changes",fallback=7)+0.3})',
    f'tl.to(["#s6-c2","#s6-m2"],{{opacity:1,duration:.3,stagger:.2}},{at(6,"stale",fallback=9)-0.3})']

# 7 Literature note
body[7] = '''<div id="s7-p" class="abs card" style="left:160px;top:180px;width:700px;height:640px;font-size:26px;color:var(--soft)">
<div class="kicker">PDF · p. 14</div><p style="margin-top:20px">… participants described the output as <mark id="s7-h1" style="background:var(--accent)">"a draft I have to argue with"</mark>, and several …</p></div>
<div id="s7-n" class="abs card" style="left:960px;top:180px;width:800px;font-size:28px"><div class="kicker">Draft note</div>
<div id="s7-q1" style="margin-top:20px">"a draft I have to argue with" (p. 14) <span id="s7-ok" class="tag ok">found on page</span></div>
<div id="s7-q2" style="margin-top:20px">"trust is never complete" (p. 15) <span id="s7-no" class="tag bad">not on page</span></div></div>
<div id="s7-r" class="abs h2" style="left:960px;top:620px;color:var(--bad)">Note refused.</div>'''
anim[7] = lambda s, L: [
    f'tl.from("#s7-p",{{opacity:0,x:-30,duration:.6}},{s+0.2})',
    f'tl.from("#s7-n",{{opacity:0,x:30,duration:.6}},{at(7,"note",fallback=2)})',
    f'tl.from("#s7-ok",{{opacity:0,scale:.8,duration:.3}},{at(7,"quotation",fallback=5)})',
    f'tl.from("#s7-no",{{opacity:0,scale:.8,duration:.3}},{at(7,"word",nth=2,fallback=6)})',
    f'tl.from("#s7-r",{{opacity:0,duration:.4}},{at(7,"word",nth=2,fallback=6)+0.8})']

# 8 Review and co-authors
body[8] = '''<div id="s8-r" class="abs card mono" style="left:160px;top:180px;width:820px;font-size:26px"><div class="kicker" style="font-family:'Hanken Grotesk'">review</div>
<div id="s8-1" style="margin-top:16px">open: 6 Findings, 8 Contributions</div>
<div id="s8-2">stale: 3.1 text changed after acceptance</div>
<div id="s8-3">no source: 5.2</div></div>
<div id="s8-v" class="abs card" style="left:1060px;top:180px;width:700px;font-size:28px"><div class="kicker">Session view · History</div>
<div id="s8-h1" style="margin-top:16px">accepted 3.1 · <b>Researcher</b></div><div id="s8-h2">commented 4.1 · <b>Co-author</b></div><div id="s8-h3">accepted 4.1 · <b>Co-author</b></div></div>'''
anim[8] = lambda s, L: [
    f'tl.from("#s8-r",{{opacity:0,y:30,duration:.6}},{s+0.2})',
    f'tl.from("#s8-1",{{opacity:0,duration:.3}},{at(8,"open",fallback=2)})',
    f'tl.from("#s8-2",{{opacity:0,duration:.3}},{at(8,"stale",fallback=3)})',
    f'tl.from("#s8-3",{{opacity:0,duration:.3}},{at(8,"source",fallback=4)})',
    f'tl.from("#s8-v",{{opacity:0,x:30,duration:.6}},{at(8,"co-authors",fallback=5)})',
    f'tl.from(["#s8-h1","#s8-h2","#s8-h3"],{{opacity:0,duration:.3,stagger:.3}},{at(8,"records",fallback=8)})']

# 9 Close
body[9] = '''<div id="s9-a" class="abs h2" style="left:160px;top:220px;color:var(--soft)">It will not tell you whether your research is good.</div>
<div id="s9-b" class="abs h1" style="left:160px;top:360px">It keeps track of<br><span style="color:var(--action)">what you decided.</span></div>
<div id="s9-t" class="abs term" style="left:160px;top:700px;width:1300px;font-size:26px"><span class="p">/plugin</span> marketplace add DanielHeinz7/research-harness<br><span class="p">/plugin</span> install research-harness@research-harness</div>'''
anim[9] = lambda s, L: [
    f'tl.from("#s9-a",{{opacity:0,duration:.6}},{s+0.2})',
    f'tl.from("#s9-b",{{opacity:0,y:30,duration:.7}},{at(9,"keeps",fallback=3)})',
    f'tl.from("#s9-t",{{opacity:0,y:20,duration:.6}},{at(9,"install",fallback=5)})']

clips, audios, js = [], [], []
for i, o in enumerate(sc, 1):
    s, L = starts[i - 1], o['len']
    clips.append(f'<div id="scene{i}" class="clip scene" data-start="{s}" data-duration="{L}" data-track-index="1">\n{body[i]}\n<div class="abs foot">research-harness</div>\n</div>')
    audios.append(f'<audio id="vo{i}" src="audio/s{i}.wav" data-start="{round(s+LEAD,2)}" data-duration="{o["dur"]}" data-track-index="2" data-volume="1"></audio>')
    js += anim[i](s, L)
    if i < len(sc):
        js.append(f'tl.to("#scene{i}",{{opacity:0,duration:.3}},{round(s+L-0.3,2)})')

html = f'''<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
<!-- Generated by build.py. Voice: ElevenLabs clone of Daniel. Rough cut, UI scenes typeset. -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>{css}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
{chr(10).join(clips)}
{chr(10).join(audios)}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
window.__timelines["main"] = tl;
</script></body></html>'''
open('index.html', 'w').write(html)
print('total', TOTAL)

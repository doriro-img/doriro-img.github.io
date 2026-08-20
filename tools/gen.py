# -*- coding: utf-8 -*-
"""도식 생성기 — 검증된 레이아웃을 스펙만 바꿔 재사용한다.
사용: from tools.gen import cards, rows, flow, band  (또는 이 파일을 직접 import)"""
import io, os

BASE = """<!doctype html>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  #art { width: 860px; padding: 34px 36px 30px; background: #fff;
    font-family: 'Pretendard','Malgun Gothic',-apple-system,sans-serif; color: #1b1b1b; }
  h1 { font-size: 20px; letter-spacing: -0.4px; margin-bottom: 4px; }
  .sub { font-size: 13.5px; color: #6b6b6b; margin-bottom: 20px; }
  .cards { display: flex; gap: 11px; margin-bottom: 15px; }
  .cd { flex: 1; border: 1px solid #e2e6ea; border-radius: 12px; overflow: hidden; }
  .cd .h { padding: 10px 14px; font-size: 13.5px; font-weight: 800; color: #fff; text-align: center; }
  .cd .b { padding: 15px 15px 17px; background: #fafbfc; }
  .cd .v { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; text-align: center; }
  .cd p { font-size: 12.5px; line-height: 1.65; color: #5a6672; }
  .cd p b { color: #1b1b1b; }
  .rows { background: #fafbfc; border: 1px solid #e6e9ed; border-radius: 10px; padding: 18px 22px 14px; margin-bottom: 15px; }
  .rw { display: flex; align-items: center; height: 46px; }
  .rw .nm { width: 168px; flex-shrink: 0; font-size: 14.5px; font-weight: 800; }
  .rw .tr { flex: 1; position: relative; height: 26px; }
  .rw .fl { height: 26px; border-radius: 6px; }
  .rw .tg { position: absolute; top: 3px; font-size: 14px; font-weight: 800; white-space: nowrap; }
  .flow { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
  .fb { flex: 1; border-radius: 11px; padding: 15px 16px; text-align: center; }
  .fb .k { font-size: 12px; font-weight: 700; margin-bottom: 5px; }
  .fb .v { font-size: 21px; font-weight: 800; letter-spacing: -0.8px; }
  .fb .n { font-size: 11.5px; margin-top: 4px; }
  .op { font-size: 20px; font-weight: 800; color: #b8c2cc; flex-shrink: 0; }
  .band { border-radius: 11px; padding: 15px 20px; display: flex; align-items: flex-start; gap: 16px; }
  .band .tag { font-size: 12px; font-weight: 800; padding: 5px 13px; border-radius: 13px;
               white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
  .band p { font-size: 13.5px; line-height: 1.75; }
  .tbl { border: 1px solid #e6e9ed; border-radius: 10px; overflow: hidden; margin-bottom: 14px; }
  .tbl .th { display: flex; background: #f2f5f7; padding: 11px 18px; font-size: 12.5px; font-weight: 800; color: #55606c; }
  .tbl .td { display: flex; padding: 13px 18px; border-top: 1px solid #eef1f4; align-items: center; }
  .tbl .td:nth-child(even) { background: #fafbfc; }
  .tbl .c1 { flex: 1.4; font-size: 14px; font-weight: 700; }
  .tbl .c1 small { display: block; font-size: 11.5px; color: #8a929c; font-weight: 500; margin-top: 2px; }
  .tbl .c2 { flex: 1; text-align: right; font-size: 15px; font-weight: 800; }
</style>
<div id="art">
  <h1>__H1__</h1>
  <p class="sub">__SUB__</p>
__BODY__
</div>
"""

C = {'g': ('#2f9e6e', '#1d7050', '#eef9f3', '#a9dcc4'),
     'b': ('#2f6fb0', '#1f4a7a', '#eff6fb', '#cfe0f0'),
     'o': ('#d4832f', '#9a6413', '#fdf6e9', '#f0dfc4'),
     'r': ('#cf4f43', '#b8463a', '#fdf3f1', '#f0b8b1'),
     's': ('#8a929c', '#55606c', '#f5f7f8', '#e2e6ea')}

def cards(items):
    out = ['  <div class="cards">']
    for it in items:
        hd, tx, p = C[it.get('c','b')][0], C[it.get('c','b')][1], it
        out.append(f'''    <div class="cd"><div class="h" style="background:{hd}">{p["head"]}</div>
      <div class="b"><div class="v" style="color:{tx}">{p["val"]}</div><p>{p["desc"]}</p></div></div>''')
    out.append('  </div>')
    return '\n'.join(out)

def rows(items, maxw=520):
    mx = max(i['w'] for i in items) or 1
    out = ['  <div class="rows">']
    for it in items:
        f, t = C[it.get('c','b')][0], C[it.get('c','b')][1]
        w = int(maxw * it['w'] / mx)
        out.append(f'''    <div class="rw"><div class="nm" style="color:{t}">{it["nm"]}</div>
      <div class="tr"><div class="fl" style="width:{w}px;background:{f}"></div>
      <div class="tg" style="left:{w+10}px;color:{t}">{it["tag"]}</div></div></div>''')
    out.append('  </div>')
    return '\n'.join(out)

def flow(items):
    out = ['  <div class="flow">']
    for i, it in enumerate(items):
        if i: out.append(f'    <div class="op">{it.get("op","=")}</div>')
        d, t, bg, bd = C[it.get('c','b')]
        n = f'<div class="n" style="color:{d}">{it["note"]}</div>' if it.get('note') else ''
        out.append(f'''    <div class="fb" style="background:{bg};border:1px solid {bd}">
      <div class="k" style="color:{d}">{it["k"]}</div><div class="v" style="color:{t}">{it["v"]}</div>{n}</div>''')
    out.append('  </div>')
    return '\n'.join(out)

def band(tag, text, dark=True, c='g'):
    if dark:
        return f'''  <div class="band" style="background:#1b1b1b">
    <div class="tag" style="background:{"#7ee0b0" if c=="g" else "#ffd97a" if c=="o" else "#ff8a7a"};color:#1b1b1b">{tag}</div>
    <p style="color:#d8dee4">{text}</p></div>'''
    d, t, bg, bd = C[c]
    return f'''  <div class="band" style="background:{bg};border:1px solid {bd}">
    <div class="tag" style="background:{d};color:#fff">{tag}</div>
    <p style="color:#4a5561">{text}</p></div>'''

def table(head, items):
    out = [f'  <div class="tbl"><div class="th"><div class="c1">{head[0]}</div><div class="c2">{head[1]}</div></div>']
    for it in items:
        sm = f'<small>{it["sub"]}</small>' if it.get('sub') else ''
        out.append(f'''    <div class="td"><div class="c1">{it["k"]}{sm}</div>
      <div class="c2" style="color:{C[it.get("c","b")][1]}">{it["v"]}</div></div>''')
    out.append('  </div>')
    return '\n'.join(out)

def make(name, h1, sub, *blocks):
    html = BASE.replace('__H1__', h1).replace('__SUB__', sub).replace('__BODY__', '\n'.join(blocks))
    io.open(f'art/{name}.html', 'w', encoding='utf-8').write(html)
    return name

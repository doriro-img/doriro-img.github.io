# -*- coding: utf-8 -*-
"""썸네일 카드 생성기 — 800x800"""
import io
TPL = """<!doctype html>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  #art { width: 800px; height: 800px; padding: 74px 64px;
    background: linear-gradient(160deg,__BG1__,__BG2__);
    font-family: 'Pretendard','Malgun Gothic',-apple-system,sans-serif; color: __TXT__;
    display: flex; flex-direction: column; justify-content: center; position: relative; }
  .tag { display: inline-block; align-self: flex-start; background: __ACC__; color: #fff;
    font-size: 21px; font-weight: 800; padding: 10px 22px; border-radius: 30px; margin-bottom: 34px; }
  h1 { font-size: __FS__px; line-height: 1.2; letter-spacing: -2px; font-weight: 800; }
  h1 .hl { color: __ACC__; }
  .sub { margin-top: 28px; font-size: 25px; color: __SUB__; font-weight: 600; }
  .sub b { color: #1d7050; }
  .badge { position: absolute; top: 130px; right: 64px; background: __ACC__; color: #fff;
    border-radius: 26px; padding: 18px 30px; font-size: 34px; font-weight: 800; letter-spacing: -1px; }
  .badge small { display: block; font-size: 17px; font-weight: 700; opacity: .9; margin-bottom: 4px; }
  .foot { position: absolute; bottom: 56px; right: 64px; font-size: 20px; color: __FOOT__; font-weight: 700; }
</style>
<div id="art">
  <div class="badge"><small>__BSUB__</small>__BIG__</div>
  <div class="tag">__TAG__</div>
  <h1>__L1__<br /><span class="hl">__L2__</span></h1>
  <p class="sub">__SUBTXT__</p>
  <div class="foot">heelovee.tistory.com</div>
</div>
"""
THEME = {
 'green':  ('#eaf6ef','#c8e6d5','#143a2a','#1d7050','#4d7d66','#86a897'),
 'blue':   ('#eef4fa,','#cbdcee','#17325a','#23508c','#536d95','#8fa4c0'),
 'navy':   ('#eef1f7','#cdd4e6','#22284a','#3a4480','#5a628f','#9198bb'),
 'brown':  ('#f6f1ea','#e6d8c4','#46341c','#8a6420','#7d6540','#ab977a'),
 'red':    ('#f9eef0','#ecd0d6','#4d2028','#a83a52','#8a5060','#b58794'),
 'orange': ('#fdf4e8','#f5dfbe','#55381a','#b0701c','#8a6636','#b79a72'),
 'teal':   ('#eaf3f0','#c9e0da','#143c34','#1d6b5c','#4d7d72','#86a89f'),
}
def tc(name, tag, l1, l2, sub, big, bsub, theme='green', fs=56):
    t = THEME[theme]
    h = (TPL.replace('__BG1__',t[0].rstrip(',')).replace('__BG2__',t[1]).replace('__TXT__',t[2])
           .replace('__ACC__',t[3]).replace('__SUB__',t[4]).replace('__FOOT__',t[5])
           .replace('__TAG__',tag).replace('__L1__',l1).replace('__L2__',l2)
           .replace('__SUBTXT__',sub).replace('__BIG__',big).replace('__BSUB__',bsub)
           .replace('__FS__',str(fs)))
    io.open(f'art/{name}.html','w',encoding='utf-8').write(h)
    return name

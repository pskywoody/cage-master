# -*- coding: utf-8 -*-
import re, os

BASE = r"D:\killersudoku\cagemaster4\i18n"
FILES = {
    "ZH": "zh-CN_笼局・三岔口-沈墨视角.txt",
    "EN": "en_caged-cipher-shanghai-1941.txt",
    "JA": "ja_籠中ノ暗号・上海1941.txt",
    "KO": "ko_笼局・三岔口-沈墨视角-한국어판.txt",
}

CN = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10}
def cnint(s):
    if s.isdigit(): return int(s)
    if s in CN: return CN[s]
    if "十" in s:
        a,b = s.split("十") if "十" in s else (s,"")
        return (CN.get(a,1) if a else 1)*10 + (CN.get(b,0) if b else 0)
    return None

# chapter-header detector per language -> list of (lineno, raw, canonical_chapter_label)
def zh_chaps(lines):
    out=[]
    for i,l in enumerate(lines,1):
        m=re.search(r"(序章|终章|第([一二三四五六七八九十]+)章)", l)
        if m:
            raw=m.group(0)
            if "序章" in raw: ch="序章"
            elif "终章" in raw: ch="终章"
            else: ch="第"+m.group(2)+"章"
            out.append((i,raw,ch))
    return out

EN_W2N={"Two":2,"Three":3,"Four":4,"Five":5,"Six":6,"Seven":7}
def en_chaps(lines):
    out=[]
    for i,l in enumerate(lines,1):
        m=re.search(r"(Prologue|Chapter\s+(Two|Three|Four|Five|Six|Seven)|The Book Closes|Finale|The End)", l)
        if m:
            g=m.group(0)
            if g=="Prologue": ch="序章"
            elif g=="The Book Closes" or g=="Finale": ch="终章"
            elif g=="The End": ch="(全书·完)"
            else: ch="第"+EN_W2N[m.group(2)].__str__()+"章"
            out.append((i,g,ch))
    return out

def ja_chaps(lines):
    out=[]
    for i,l in enumerate(lines,1):
        m=re.search(r"(序章|終章|終幕|第([一二三四五六七八九十]+)章|プロローグ|The End)", l)
        if m:
            g=m.group(0)
            if "序章" in g or "プロローグ" in g: ch="序章"
            elif "終章" in g: ch="终章"
            elif "終幕" in g: ch="(終幕/全书)"
            elif "The End" in g: ch="(全书·完)"
            else: ch="第"+m.group(2)+"章"
            out.append((i,g,ch))
    return out

def ko_chaps(lines):
    out=[]
    for i,l in enumerate(lines,1):
        m=re.search(r"(서장|종막|제(\d+)장|The End|전서)", l)
        if m:
            g=m.group(0)
            if "서장" in g: ch="序章"
            elif "종막" in g: ch="(終幕/全书)"
            elif "The End" in g or "전서" in g: ch="(全书·完)"
            else: ch="第"+m.group(2)+"장"
            out.append((i,g,ch))
    return out

CHAPFN={"ZH":zh_chaps,"EN":en_chaps,"JA":ja_chaps,"KO":ko_chaps}

def outline(lang, fname):
    txt=open(os.path.join(BASE,fname),encoding="utf-8").read()
    lines=txt.splitlines()
    tags=[(i,int(x)) for i,x in enumerate(re.findall(r"level-(\d{3})", txt),1)]
    # map each tag to nearest preceding chapter header
    chaps=CHAPFN[lang](lines)
    print(f"\n===== {lang} : {fname} =====")
    print(f"-- chapter headers ({len(chaps)}) --")
    for i,raw,ch in chaps:
        print(f"   L{i:>5}  {ch:<8}  {raw}")
    print(f"-- level-XXX tags: {len(tags)} unique={len(set(t for _,t in tags))} --")
    # group tags by chapter block
    ch_idx=0
    blocks=[]
    cur=None
    for i,t in tags:
        while ch_idx+1 < len(chaps) and i > chaps[ch_idx+1][0]:
            ch_idx+=1
        chlabel = chaps[ch_idx][2] if chaps else "?"
        blocks.append((chlabel,t))
    # summarize per chapter: list of levels
    from collections import OrderedDict
    d=OrderedDict()
    for ch,t in blocks:
        d.setdefault(ch,[]).append(t)
    print("-- levels grouped by chapter block (from level-XXX tags) --")
    for ch,ts in d.items():
        uniq=sorted(set(ts))
        print(f"   {ch:<10} n={len(ts):>3} unique={len(uniq):>2}  {uniq}")

for lang,f in FILES.items():
    outline(lang,f)

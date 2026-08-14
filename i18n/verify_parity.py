# -*- coding: utf-8 -*-
import re, os

BASE = r"D:\killersudoku\cagemaster4\i18n"
FILES = {
    "ZH": "zh-CN_笼局・三岔口-沈墨视角.txt",
    "EN": "en_caged-cipher-shanghai-1941.txt",
    "JA": "ja_籠中ノ暗号・上海1941.txt",
    "KO": "ko_笼局・三岔口-沈墨视角-한국어판.txt",
}

CN_NUM = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10}

def cn_to_int(s):
    # simple: handles 一..十, 十一..十九, 二十.. etc. (enough for chapters/levels)
    if s.isdigit(): return int(s)
    if s in CN_NUM: return CN_NUM[s]
    if "十" in s:
        parts = s.split("十")
        left = parts[0]; right = parts[1] if len(parts)>1 else ""
        tens = CN_NUM.get(left,1) if left else 1
        ones = CN_NUM.get(right,0) if right else 0
        return tens*10 + ones
    return None

# ---- canonical universe via level-XXX tags ----
def extract_level_tags(text):
    return set(int(x) for x in re.findall(r"level-(\d{3})", text))

# ---- EN: also parse "Chapter X ... (101–109)" / "Prologue (101-109)" ranges ----
def en_universe(text):
    ids=set()
    for m in re.finditer(r"(Prologue|Chapter\s+(?:Two|Three|Four|Five|Six|Seven)|The Book Closes)\s*[·.]?\s*[^(]*\((\d{3})[–-](\d{3})\)", text):
        a,b=int(m.group(2)),int(m.group(3))
        ids.update(range(a,b+1))
    return ids

EN_WORD2NUM={"Two":2,"Three":3,"Four":4,"Five":5,"Six":6,"Seven":7}

# ---- ZH: map 第N关 to canonical via preceding chapter header ----
def zh_mapped(text):
    ids=set()
    cur_ch=0
    for line in text.splitlines():
        # chapter header detection
        mch=re.search(r"序章|终章|第([一二三四五六七八九十]+)章", line)
        if mch:
            if "序章" in mch.group(0): cur_ch=1
            elif "终章" in mch.group(0): cur_ch=8
            else: cur_ch=cn_to_int(mch.group(1))
        for ml in re.finditer(r"第([一二三四五六七八九十\d]+)关", line):
            n=cn_to_int(ml.group(1))
            if cur_ch and n:
                ids.add(cur_ch*100+n)
    return ids

# ---- native level markers with chapter tracking for JA/KO ----
def ja_mapped(text):
    ids=set(); cur_ch=0
    for line in text.splitlines():
        mch=re.search(r"序章|終章|第([一二三四五六七八九十]+)章|Prologue|Chapter (\w+)|The End", line)
        if mch:
            g=mch.group(0)
            if "序章" in g: cur_ch=1
            elif "終章" in g: cur_ch=8
            elif mch.group(1): cur_ch=cn_to_int(mch.group(1))
            elif "Prologue" in g: cur_ch=1
            elif "Chapter" in g and mch.group(2): cur_ch=EN_WORD2NUM.get(mch.group(2),cur_ch)
        # レベルN or Level N
        for ml in re.finditer(r"(?:レベル|Level)\s*(\d+)", line):
            n=int(ml.group(1))
            if cur_ch and 1<=n<=9:
                ids.add(cur_ch*100+n)
    return ids

def ko_mapped(text):
    ids=set(); cur_ch=0
    for line in text.splitlines():
        mch=re.search(r"서장|종막|제(\d+)장|Prologue|Chapter (\w+)|The End", line)
        if mch:
            g=mch.group(0)
            if "서장" in g: cur_ch=1
            elif "종막" in g: cur_ch=8
            elif mch.group(1): cur_ch=int(mch.group(1))
            elif "Prologue" in g: cur_ch=1
            elif "Chapter" in g and mch.group(2): cur_ch=EN_WORD2NUM.get(mch.group(2),cur_ch)
        for ml in re.finditer(r"(?:제(\d+)관|Level\s*(\d+))", line):
            n=int(ml.group(1) or ml.group(2))
            if cur_ch and 1<=n<=9:
                ids.add(cur_ch*100+n)
    return ids

results={}
texts={}
for k,f in FILES.items():
    p=os.path.join(BASE,f)
    t=open(p,encoding="utf-8").read()
    texts[k]=t
    direct=extract_level_tags(t)
    results[k]={"direct":direct}

# EN universe from ranges
en_uni = en_universe(texts["EN"])
results["EN"]["universe"]=en_uni
# mapped native for each
results["ZH"]["mapped"]=zh_mapped(texts["ZH"])
results["JA"]["mapped"]=ja_mapped(texts["JA"])
results["KO"]["mapped"]=ko_mapped(texts["KO"])
results["JA"]["direct_union"]=results["JA"]["direct"] | results["JA"]["mapped"]
results["KO"]["direct_union"]=results["KO"]["direct"] | results["KO"]["mapped"]

# ---- report ----
print("="*70)
print("DIRECT level-XXX tag counts (canonical ids found in file):")
for k in FILES:
    print(f"  {k}: {len(results[k]['direct'])} unique  -> {sorted(results[k]['direct'])}")
print("-"*70)
print(f"EN universe from chapter ranges (101-109 etc.): {len(en_uni)} -> {sorted(en_uni)}")
print("-"*70)
print("MAPPED native level markers -> canonical (chapter*100+level):")
for k in ["ZH","JA","KO"]:
    mp=results[k].get("mapped",set())
    print(f"  {k}: {len(mp)} unique -> {sorted(mp)}")
print("="*70)

# Build best canonical set per language
best={
 "EN": results["EN"]["direct"] if results["EN"]["direct"] else en_uni,
 "JA": results["JA"]["direct_union"],
 "KO": results["KO"]["direct_union"],
 "ZH": results["ZH"]["mapped"],
}
print("BEST canonical set per language (union of direct+mapped):")
for k in FILES:
    print(f"  {k}: {len(best[k])} -> {sorted(best[k])}")
print("-"*70)

# Parity vs EN universe
ref = en_uni if en_uni else best["EN"]
print(f"REFERENCE universe (EN ranges): {len(ref)} levels")
for k in FILES:
    s=best[k]
    missing = sorted(ref - s)
    extra = sorted(s - ref)
    print(f"  {k}: in_ref={len(s & ref)}  missing_vs_EN={missing}  extra_vs_EN={extra}")
print("="*70)

# Boss levels expected
boss_expected={109,209,309,409,509,609,809}
print("BOSS levels (109/209/309/409/509/609/809) presence per language:")
for k in FILES:
    s=best[k]
    present=[b for b in sorted(boss_expected) if b in s]
    absent=[b for b in sorted(boss_expected) if b not in s]
    print(f"  {k}: present={present}  ABSENT={absent}")

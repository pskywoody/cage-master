# -*- coding: utf-8 -*-
import re, os
BASE = r"D:\killersudoku\cagemaster4\i18n"
f = "en_caged-cipher-shanghai-1941.txt"
lines = open(os.path.join(BASE,f),encoding="utf-8").read().splitlines()

# chapter header detection for EN
chap_pat = re.compile(r"(Prologue|Chapter\s+(Two|Three|Four|Five|Six|Seven)|The Book Closes|Finale|The End)")
EN_W2N={"Two":2,"Three":3,"Four":4,"Five":5,"Six":6,"Seven":7}
# level header detection
lvl_pat = re.compile(r"^Level\s+(\d+)\s*·\s*(.+?)\s*(\(level-(\d{3})\))?\s*$")

cur=None
blocks=[]  # (chapter, [(lineno, lvl, name, tag_or_None)])
for i,l in enumerate(lines,1):
    m=chap_pat.search(l)
    if m:
        g=m.group(0)
        if g=="Prologue": cur="Prologue"
        elif g in ("The Book Closes","Finale"): cur="Finale"
        elif g=="The End": cur="(The End)"
        else: cur="Ch"+str(EN_W2N[m.group(2)])
        blocks.append((cur,[]))
        continue
    ml=lvl_pat.match(l)
    if ml and cur is not None:
        blocks[-1][1].append((i, int(ml.group(1)), ml.group(2).strip(), ml.group(4)))

print("=== EN level headers per chapter (tagged vs untagged) ===")
for ch, lv in blocks:
    if not lv: continue
    tagged=[x for x in lv if x[3]]
    untagged=[x for x in lv if not x[3]]
    print(f"\n## {ch}  (headers={len(lv)}, tagged={len(tagged)}, untagged={len(untagged)})")
    for i,num,name,tag in lv:
        print(f"   L{i:>5}  L{num:<2} tag={tag or '---':<6}  {name[:40]}")

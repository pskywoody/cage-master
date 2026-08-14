import re, os

base = r"D:\killersudoku\cagemaster4\i18n"
files = {
    "ZH": "zh-CN_笼局・三岔口-沈墨视角.txt",
    "EN": "en_caged-cipher-shanghai-1941.txt",
    "JA": "ja_籠中ノ暗号・上海1941.txt",
    "KO": "ko_笼局・三岔口-沈墨视角-한국어판.txt",
}

# Per-language extraction patterns (each returns a 3-digit id string)
patterns = {
    # ZH uses `### 101 Name` for ch1-3 and `（level-XXX）` for ch4-8
    "ZH": [r"###\s+(\d{3})\b", r"level-(\d{3})"],
    # EN/JA/KO use `level-XXX` (in heading or `- Board: level-XXX`)
    "EN": [r"level-(\d{3})"],
    "JA": [r"level-(\d{3})"],
    "KO": [r"level-(\d{3})"],
}

CANON = [n for ch in range(1,9) for n in range(ch*100+1, ch*100+10)]  # 101..809

def _group_ranges(lst):
    groups=[]; cur=[]
    for n in lst:
        if cur and n==cur[-1]+1: cur.append(n)
        else:
            if cur: groups.append(cur)
            cur=[n]
    if cur: groups.append(cur)
    return groups

print("="*78)
print("CAGEMASTER4 · FORMAT-AWARE LEVEL PARITY (canonical axis 101..809)")
print("="*78)

results = {}
for lang, fn in files.items():
    txt = open(os.path.join(base, fn), encoding="utf-8").read()
    ids = []
    for pat in patterns[lang]:
        ids += re.findall(pat, txt)
    ids = [int(x) for x in ids]
    cnt = {}
    for x in ids: cnt[x] = cnt.get(x, 0) + 1
    present = sorted(cnt)
    missing = [n for n in CANON if n not in cnt]
    dup = [n for n in present if cnt[n] > 1]
    results[lang] = (cnt, present, missing, dup)
    print(f"\n### {lang}  distinct-levels={len(present)}  total-anchors={len(ids)}")
    print(f"   present ranges: " + ", ".join(
        f"{min(g)}-{max(g)}" for g in _group_ranges(present)) if present else "   (none)")
    # helper defined below
    print(f"   MISSING canonical ({len(missing)}): {missing}")
    print(f"   DUPLICATED ({len(dup)}): " + ", ".join(f"{d}(x{cnt[d]})" for d in dup))

print("\n" + "="*78)
print("ALIGNMENT MATRIX (canonical 101..809 = 72 levels)")
print("="*78)
hdr = "id     " + "".join(f"{lang:>6}" for lang in files)
print(hdr)
for n in CANON:
    row = f"{n:<6} "
    for lang in files:
        cnt = results[lang][0]
        c = cnt.get(n, 0)
        if c == 0: mark = "·"
        elif c == 1: mark = "✓"
        else: mark = f"×{c}"
        row += f"{mark:>6}"
    print(row)

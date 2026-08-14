import re, os

base = r"D:\killersudoku\cagemaster4\i18n"
files = {
    "ZH": "zh-CN_笼局・三岔口-沈墨视角.txt",
    "EN": "en_caged-cipher-shanghai-1941.txt",
    "JA": "ja_籠中ノ暗号・上海1941.txt",
    "KO": "ko_笼局・三岔口-沈墨视角-한국어판.txt",
}

chapters = {1: range(101,110), 2: range(201,210), 3: range(301,310),
            4: range(401,410), 5: range(501,510), 6: range(601,610),
            7: range(701,710), 8: range(801,810)}

def all_ids(path):
    txt = open(path, encoding="utf-8").read()
    return [int(x) for x in re.findall(r"level-(\d{3})", txt)]  # int keys to match chapter ranges

print("="*78)
print("CAGEMASTER4 · FOUR-LANGUAGE SHIPPABILITY CHECK")
print("="*78)
overall = {}
for lang, fn in files.items():
    p = os.path.join(base, fn)
    ids = all_ids(p)
    cnt = {}
    for x in ids: cnt[x] = cnt.get(x, 0) + 1
    print(f"\n### {lang}  ({fn})  total level-anchors={len(ids)}")
    problems = []
    present = 0
    for ch, rng in chapters.items():
        have = [n for n in rng if n in cnt]
        miss = [n for n in rng if n not in cnt]
        dup  = [n for n in rng if cnt.get(n,0) > 1]
        present += len(have)
        flag = ""
        if miss: flag += f" MISSING:{miss}"
        if dup:  flag += f" DUP:{dup}(x{cnt[dup[0]]})" if len(dup)==1 else f" DUP:{dup}"
        status = "ok" if not miss and not dup else "BAD"
        print(f"  Ch{ch} [{min(rng)}-{max(rng)}]: {len(have)}/9  {status}{flag}")
        if miss or dup: problems.append((ch, miss, dup))
    # chapter header presence
    headers = []
    for line in open(p, encoding="utf-8"):
        if re.search(r"第.章|Chapter|終章|제.장|Epilogue|Final", line):
            headers.append(line.strip()[:60])
    ok = len(problems) == 0
    overall[lang] = ok
    print(f"  >> {'SHIPPABLE' if ok else 'NOT SHIPPABLE'}  (levels present {present}/72)")
    if headers:
        print(f"  chapter markers ({len(headers)}): " + " | ".join(headers[:14]))

print("\n" + "="*78)
print("VERDICT:", "ALL SHIPPABLE" if all(overall.values()) else "BLOCKERS PRESENT")
for k,v in overall.items():
    print(f"  {k}: {'OK' if v else 'BLOCKED'}")
print("="*78)

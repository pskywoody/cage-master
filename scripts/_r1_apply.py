# -*- coding: utf-8 -*-
import io, re

src = r"D:\desktop\笼局・三岔口-沈墨视角-英本.txt.bak3"   # pristine pre-R1
dst = r"D:\desktop\笼局・三岔口-沈墨视角-英本.txt"

with io.open(src, "r", encoding="utf-8-sig") as f:
    lines = f.readlines()

def skip(line, idx):
    # summary table rows
    if re.match(r"^\s*\d{3}\s*\|\s*\d{3}\s*\|", line):
        return True
    # UI / label markers (with OR without leading bracket): Display / Board feature / CG
    if re.search(r"-\s*\[?\s*(Display|Board feature|CG)\b", line):
        return True
    # chapter headers
    if line.strip().startswith("## Chapter"):
        return True
    # protected tender moments
    low = line.lower()
    if "congee" in low or "i know" in low:
        return True
    # R2/R3 headline lines (flattened later, not word-cut now)
    if idx in (1834, 1953):
        return True
    return False

adverb1 = re.compile(r"\s+(fully|wholly|completely)\s+")
adverb2 = re.compile(r"\s+(fully|wholly|completely)([.,;:!?])")
traj1 = re.compile(r"trajector(y)\b")
traj2 = re.compile(r"trajector(ies)\b")
conv = re.compile(r"converg(e|es|ed)\b")
conv_n = re.compile(r"convergen(ce)\b")

changed = []
for i, line in enumerate(lines, 1):
    if skip(line, i):
        continue
    new = line
    new = adverb1.sub(" ", new)
    new = adverb2.sub(r"\2", new)
    new = traj1.sub("route", new)
    new = traj2.sub("routes", new)
    new = conv.sub(lambda m: {"e": "gather", "es": "gathers", "ed": "gathered"}[m.group(1)], new)
    new = conv_n.sub("gathering", new)
    if new != line:
        changed.append(i)
        lines[i - 1] = new

with io.open(dst, "w", encoding="utf-8-sig") as f:
    f.writelines(lines)

print("Lines changed (corrected):", len(changed))
print(changed)

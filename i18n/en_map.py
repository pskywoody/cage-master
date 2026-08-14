import re, collections

path = r"D:\killersudoku\cagemaster4\i18n\en_caged-cipher-shanghai-1941.txt"
lines = open(path, encoding="utf-8").read().split("\n")

# Capture every line that introduces/references a level id, with the kind of marker
pat_hdr = re.compile(r"\(level-(\d{3})\)")          # Level N · Name (level-XXX)
pat_id  = re.compile(r"\[Level ID\]\s*level-(\d{3})")  # [Level ID] level-XXX
pat_lv  = re.compile(r"^#*\s*Level\s+(\d{3})\s*[·\.]")  # Level 501 · Name  (no parens)
pat_lv2 = re.compile(r"^#*\s*Level\s+(\d+)\s*·.*\(level-(\d{3})\)")

occ = collections.defaultdict(list)
for i, ln in enumerate(lines, 1):
    m = pat_lv2.search(ln)
    if m:
        occ[int(m.group(2))].append((i, "hdr", ln.strip()[:70])); continue
    m = pat_hdr.search(ln)
    if m:
        occ[int(m.group(1))].append((i, "paren", ln.strip()[:70])); continue
    m = pat_id.search(ln)
    if m:
        occ[int(m.group(1))].append((i, "idtag", ln.strip()[:70])); continue
    m = pat_lv.search(ln)
    if m:
        occ[int(m.group(1))].append((i, "lvXXX", ln.strip()[:70]))

# Print ordered by level id
for lid in sorted(occ):
    entries = occ[lid]
    print(f"\n=== level-{lid}  ({len(entries)} refs) ===")
    for i, kind, txt in entries:
        print(f"  L{i:<5} [{kind:<6}] {txt}")

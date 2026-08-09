# -*- coding: utf-8 -*-
import io, re

path = r"D:\desktop\笼局・三岔口-沈墨视角-英本.txt"
with io.open(path, "r", encoding="utf-8-sig") as f:
    lines = f.readlines()

# target roots
roots = {
    "fully": re.compile(r"\bfully\b", re.I),
    "wholly": re.compile(r"\bwholly\b", re.I),
    "completely": re.compile(r"\bcompletely\b", re.I),
    "complete*": re.compile(r"\bcomplet(e|es|ed|ing|ion|ely)\b", re.I),
    "trajectory": re.compile(r"\btrajector(y|ies)\b", re.I),
    "converg*": re.compile(r"\bconverg(e|es|ed|ence|ing)\b", re.I),
    "belong*": re.compile(r"\bbelong(s|ed|ing|s to)\b", re.I),
}

# A line is a "UI/label/heading" line if it is structural, not Shen Mo narration prose.
def is_ui_label(line):
    s = line.strip()
    if s.startswith("###") or s.startswith("##") or s.startswith("#"):
        return True
    if re.search(r"\[(Scene|Interaction|Board|System|Choice|Voice|Emotion|SFX|VO|Scene Name|Board Layer|Board Interaction|Summary|Note)", line):
        return True
    if re.search(r"level-\d{3}", line):
        return True
    if re.match(r"^\s*\d{3}\s*\|\s*\d{3}\s*\|", line):  # summary table row
        return True
    return False

# High-light node markers (Round-3 protected; flag but do not cut in R1)
def is_highlight(line):
    low = line.lower()
    markers = ["su wan", "pan hanyu", "the congee", "congee", "i know", "vera", "ito"]
    return any(m in low for m in markers)

results = {}
total = 0
for name, rx in roots.items():
    hits = []
    for i, ln in enumerate(lines, 1):
        m = rx.search(ln)
        if m:
            snippet = ln.strip()
            if len(snippet) > 200:
                snippet = snippet[:200] + "..."
            layer = "UI/LABEL" if is_ui_label(ln) else ("NARRATION" )
            hl = " [HIGHLIGHT]" if is_highlight(ln) else ""
            hits.append((i, layer + hl, snippet))
            total += 1
    results[name] = hits

with io.open(r"D:\killersudoku\cagemaster4\scripts\_r1_baseline_out.txt", "w", encoding="utf-8") as out:
    out.write("=== R1 BASELINE QUANTIFICATION ===\n")
    out.write("File: 笼局・三岔口-沈墨视角-英本.txt\n")
    out.write("Target roots: fully / wholly / completely / complete* / trajectory / converg* / belong*\n\n")
    out.write("TOTAL raw matches: %d\n\n" % total)
    for name in roots:
        hits = results[name]
        out.write("-"*80 + "\n")
        out.write("%s : %d matches\n" % (name, len(hits)))
        for (i, layer, snip) in hits:
            out.write("  L%-5d [%-12s] %s\n" % (i, layer, snip))
        out.write("\n")

print("TOTAL matches:", total)
for name in roots:
    print("  %-12s %d" % (name, len(results[name])))

# -*- coding: utf-8 -*-
import io

path = r"D:\desktop\笼局・三岔口-沈墨视角-英本.txt"
with io.open(path, "r", encoding="utf-8-sig") as f:
    L = f.readlines()

# (line_number, expected_current_start, new_flattened_text)
edits = {
    971:  ("- Shen Mo confirms the mother's final destination and withdrawal path.",
           "The mother's road ends in Vladivostok. November 15."),
    1354: ("- Shen Mo grasps his own file's state: selectively tampered with, yet not cleared",
           "His file: tampered, not erased. A risk remains."),
    1433: ("- Shen Mo verifies precisely: before the morning of December 8, Yamada's search file was in a frozen state",
           "Before December 8, Yamada's file sits frozen — no new entry, no mark. The barrier holds."),
    1515: ("- Shen Mo verifies: the teacher's full set of original puzzles was completed and laid out in spring 1941",
           "The teacher's puzzles were set in spring 1941. The Sorge case stalled the plan."),
    1629: ("- Shen Mo clarifies the father's movement trail, mending the hidden-action gap of early December",
           "The father left early, erasing every trace. The December gap closes."),
    1667: ("- Shen Mo clarifies the final foreshadowing, confirming the father safely left Shanghai for a new front",
           "The father reached a new front. The last foreshadowing clears."),
    1751: ("- Shen Mo confirms the object's safety: the envelope's delivery controllable",
           "The envelope: untouched, unopened. Its core clue intact."),
    1779: ("- Shen Mo verifies the endpoint trail: the windowsill address intact",
           "The windowsill address holds — no shift, no cover, no new mark. The chain loops clean."),
    1807: ("- Shen Mo clarifies the final thread: the father's handwriting, the hidden address, and the withdrawal route become three lines as one",
           "Handwriting, hidden address, withdrawal route — three lines, one. Every trail loops."),
    1834: ("- Shen Mo fully confirms the forward path's belonging: the route set, the direction certain",
           "The path is clear."),
    1867: ("- Shen Mo bids farewell to the counting house's daily companionship.",
           "He leaves the counting house. The white bowl faces east; the peace signal stays."),
    1895: ("- Shen Mo anchors the forward direction: the course set, the road clear",
           "The road ahead is set."),
    1923: ("- Shen Mo confirms the forward road's safety: the route constant, the heading unchanged",
           "The road holds. Every restraint now drives toward the one direction."),
}

ok, warn = [], []
for n, (expect, new) in edits.items():
    cur = L[n-1].rstrip("\n")
    if cur.startswith(expect[:40]):
        L[n-1] = new + "\n"
        ok.append(n)
    else:
        warn.append((n, cur[:80]))

with io.open(path, "w", encoding="utf-8-sig") as f:
    f.writelines(L)

print("R2 flattened lines:", ok)
if warn:
    print("WARNING unmatched:", warn)

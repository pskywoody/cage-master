import shutil, re
targets = [
    "D:/desktop/笼局・三岔口-沈墨视角.txt",
    "D:/killersudoku/cagemaster4/i18n/zh-CN_笼局・三岔口-沈墨视角.txt",
]
pat = re.compile(r'^Boss 击败：')
for f in targets:
    bak = f + ".bak_before_strip"
    shutil.copy2(f, bak)
    with open(f, encoding='utf-8') as fh:
        lines = fh.readlines()
    before = sum(1 for l in lines if pat.match(l.rstrip('\n')))
    out = [l for l in lines if not pat.match(l.rstrip('\n'))]
    with open(f, 'w', encoding='utf-8') as fh:
        fh.writelines(out)
    print(f"{f}\n  backup: {bak}\n  removed: {before} -> remaining inline: {len(out) and sum(1 for l in out if pat.match(l.rstrip(chr(10))))}")

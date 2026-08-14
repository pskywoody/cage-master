import re
files = {
 "ZH": "D:/killersudoku/cagemaster4/i18n/zh-CN_笼局・三岔口-沈墨视角.txt",
 "EN": "D:/killersudoku/cagemaster4/i18n/en_caged-cipher-shanghai-1941.txt",
 "JA": "D:/killersudoku/cagemaster4/i18n/ja_籠中ノ暗号・上海1941.txt",
 "KO": "D:/killersudoku/cagemaster4/i18n/ko_笼局・三岔口-沈墨视角-한국어판.txt",
}
def count_levels(path):
    with open(path, encoding='utf-8') as fh:
        t = fh.read()
    zh = len(re.findall(r'第[1-9]关', t))
    en = len(re.findall(r'Level [1-9]\b', t))
    ja = len(re.findall(r'レベル[1-9]', t)) + len(re.findall(r'Level [1-9]\b', t))
    ko = len(re.findall(r'제[1-9]관', t)) + len(re.findall(r'Level [1-9]\b', t))
    boss_zh = len(re.findall(r'第9关', t))
    boss_en = len(re.findall(r'Level 9\b', t))
    boss_ja = len(re.findall(r'レベル9', t)) + len(re.findall(r'Level 9\b', t))
    boss_ko = len(re.findall(r'제9관', t)) + len(re.findall(r'Level 9\b', t))
    return zh, en, ja, ko, boss_zh, boss_en, boss_ja, boss_ko

res = {k: count_levels(v) for k,v in files.items()}
print(f"{'':4} | 总关(ZH式) | Level计数 | レベル/제관 | Boss关(第9关/Level9)")
for k in files:
    zh,en,ja,ko,bz,be,bj,bk = res[k]
    print(f"{k:4} |   {zh:>3}      |  {en:>3}    |  {ja:>3}/{ko:<3}  |  {bz}/{be}/{bj}/{bk}")

print("\n=== 终章 level-809 标记检测 ===")
for k,f in files.items():
    t=open(f,encoding='utf-8').read()
    markers=[]
    for m in ['level-809','全書・完','全书','終章','终章','The Book Closes','The End','제7장・종막','종막・납호','Level 9 · Pan Hanyu']:
        if m in t: markers.append(m)
    print(f"  {k}: level-809标签={'level-809' in t}  终章类标记={markers[:5]}")

import re
files = {
 "ZH": "D:/killersudoku/cagemaster4/i18n/zh-CN_笼局・三岔口-沈墨视角.txt",
 "EN": "D:/killersudoku/cagemaster4/i18n/en_caged-cipher-shanghai-1941.txt",
 "JA": "D:/killersudoku/cagemaster4/i18n/ja_籠中ノ暗号・上海1941.txt",
 "KO": "D:/killersudoku/cagemaster4/i18n/ko_笼局・三岔口-沈墨视角-한국어판.txt",
}
pat = re.compile(r'level-(\d{3})')
boss_ids = {'109','209','309','409','509','609','709','809'}
data = {}
for k,f in files.items():
    with open(f, encoding='utf-8') as fh:
        txt = fh.read()
    ids = pat.findall(txt)
    uniq = sorted(set(ids))
    data[k] = uniq
    bosses = [x for x in uniq if x.endswith('09')]
    missing = sorted(boss_ids - set(uniq))
    print(f"=== {k} ===")
    print(f"  level-id 出现总次数(含重复): {len(ids)}")
    print(f"  去重后关卡数: {len(uniq)}  (最小~最大: {uniq[0]}~{uniq[-1]})")
    print(f"   Boss关(x09): {bosses}")
    print(f"   缺失的 8 个标准Boss关: {missing if missing else '无'}")
    print()
base = set(data['ZH'])
print("=== 四语 level-id 集合交叉比对 (相对 ZH) ===")
for k in ['EN','JA','KO']:
    s = set(data[k])
    print(f"  {k}: 与ZH相同={s==base}  仅在ZH有={sorted(base-s)}  仅在{k}有={sorted(s-base)}")

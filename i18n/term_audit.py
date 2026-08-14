# -*- coding: utf-8 -*-
import os, re
BASE = r"D:\killersudoku\cagemaster4\i18n"
FILES = {
    "ZH": "zh-CN_笼局・三岔口-沈墨视角.txt",
    "EN": "en_caged-cipher-shanghai-1941.txt",
    "JA": "ja_籠中ノ暗号・上海1941.txt",
    "KO": "ko_笼局・三岔口-沈墨视角-한국어판.txt",
}
texts = {k: open(os.path.join(BASE,f),encoding="utf-8").read() for k,f in FILES.items()}

# term variants to count per language (regex-friendly)
CHECKS = {
 "隐曜/隠曜/은요(Hidden Radiance/Luminary 本体)": {
    "ZH": r"隐曜", "EN": r"Hidden Radiance|Hidden Luminary", "JA": r"隠曜", "KO": r"은요|隱曜"},
 "Hidden Radiance(EN 技巧义)": {"EN": r"Hidden Radiance"},
 "Hidden Luminary(EN 机制义)": {"EN": r"Hidden Luminary"},
 "Lone Star/孤星": {"ZH": r"孤星", "EN": r"Lone Star", "JA": r"孤星", "KO": r"고성"},
 "Twin Lock/并蒂锁": {"ZH": r"并蒂锁", "EN": r"Twin Lock", "JA": r"并蒂鎖", "KO": r"병제쇄"},
 "Twin Luminary/双曜": {"ZH": r"双曜", "EN": r"Twin Luminary", "JA": r"双曜", "KO": r"쌍요"},
 "Ninth-Order/九阶": {"ZH": r"九阶", "EN": r"Ninth-Order", "JA": r"九階", "KO": r"구계"},
 "Cage/笼/籠/케이지": {"ZH": r"笼", "EN": r"Cage", "JA": r"籠", "KO": r"케이지"},
 "Star Balance/星衡": {"ZH": r"星衡", "EN": r"Star Balance", "JA": r"星衡", "KO": r"성형"},
 "Three Seed/三子法": {"ZH": r"三子法", "EN": r"Three Seed", "JA": r"三子", "KO": r"삼자법"},
 "Twin Axis/二连纵横阵": {"ZH": r"二连纵横阵", "EN": r"Twin Axis", "JA": r"二連縦横陣", "KO": r"이련종횡진"},
 "Three-Talent/三才游鱼阵": {"ZH": r"三才游鱼阵", "EN": r"Three-Talent|Three Talent", "JA": r"三才遊魚陣", "KO": r"삼재유어진"},
 "TPL专有词(应不译)": {"ZH": r"TPL|Director|StrategySelector|IntentObserver|DramaEventManager|Ghost|Hub|Heat|Threat",
                        "EN": r"TPL|Director|StrategySelector|IntentObserver|DramaEventManager|Ghost|Hub|Heat|Threat",
                        "JA": r"TPL|Director|StrategySelector|IntentObserver|DramaEventManager|Ghost|Hub|Heat|Threat",
                        "KO": r"TPL|Director|StrategySelector|IntentObserver|DramaEventManager|Ghost|Hub|Heat|Threat"},
}

print(f"{'TERM':<42}{'ZH':>6}{'EN':>7}{'JA':>7}{'KO':>7}")
for name, pat in CHECKS.items():
    row=[]
    for lang in ["ZH","EN","JA","KO"]:
        p = pat.get(lang)
        if not p:
            row.append("  -  ")
        else:
            n = len(re.findall(p, texts[lang]))
            row.append(f"{n:>5} ")
    print(f"{name:<40}" + "".join(row))

# EN: show Hidden Radiance/Luminary contexts to judge technique vs mechanic
print("\n--- EN 'Hidden Radiance/Luminary' occurrences (context) ---")
for m in re.finditer(r".{0,40}(Hidden Radiance|Hidden Luminary).{0,40}", texts["EN"]):
    print(repr(m.group(0)))

# -*- coding: utf-8 -*-
import json, os

# 固定对照表（用户提供，禁止重新翻译）→ 直接生成对齐 locale 资产
ROWS = [
    # level, boss_id, zh-CN, en-US, ja-JP, ko-KR
    ("level-109", "short_stroke",
     "Boss 击败：短横（匿名寄信人）",
     "Boss Defeated: Short Stroke (Unknown Sender)",
     "ボス撃破：短横（匿名の差出人）",
     "보스 격파：단횡（익명의 발신자）"),
    ("level-209", "shenshian",
     "Boss 击败：父亲·沈世安（未竟之路）",
     "Boss Defeated: Father·Shen Shi'an (The Unfinished Path)",
     "ボス撃破：父・沈世安（果たされぬ道）",
     "보스 격파：아버지・심세안（이루어지지 않은 길）"),
    ("level-309", "ito_1",
     "Boss 击败：伊藤（第一次交锋）",
     "Boss Defeated: Ito (First Skirmish)",
     "ボス撃破：伊藤（初めての相撃）",
     "보스 격파：이토（첫 교전）"),
    ("level-409", "yamada_tokko",
     "Boss 击败：山田特高课（第一次交锋）",
     "Boss Defeated: Yamada's Tokkō (First Skirmish)",
     "ボス撃破：山田特高課（初めての相撃）",
     "보스 격파：야마다 특고과（첫 교전）"),
    ("level-509", "df_unit",
     "Boss 击败：日军无线电测向队",
     "Boss Defeated: Japanese Radio Direction-Finding Unit",
     "ボス撃破：日本軍無線方位測定隊",
     "보스 격파：일본군 무선 방향 탐지대"),
    ("level-609", "yamada_chief",
     "Boss 击败：山田课长（最终交锋）",
     "Boss Defeated: Chief Yamada (Final Skirmish)",
     "ボス撃破：山田課長（最終の相撃）",
     "보스 격파：야마다 과장（최종 교전）"),
    ("level-809", "ito_final",
     "Boss 击败：伊藤（最终对决）",
     "Boss Defeated: Ito (Final Confrontation)",
     "ボス撃破：伊藤（最終対決）",
     "보스 격파：이토（최종 대결）"),
]

LANGS = ["zh-CN", "en-US", "ja-JP", "ko-KR"]
base = "D:/killersudoku/cagemaster4/i18n/locale"

# 1) 每语言独立 battle.json（R8 目标结构）
per_lang = {l: {} for l in LANGS}
combined = {}
for level, bid, zh, en, ja, ko in ROWS:
    key = f"boss.{bid}.victory.01"
    texts = {"zh-CN": zh, "en-US": en, "ja-JP": ja, "ko-KR": ko}
    for l in LANGS:
        per_lang[l][key] = {
            "level": level,
            "boss_id": bid,
            "type": "B",            # System Feedback / 胜利结算
            "phase": "victory",
            "text": texts[l],
        }
    combined[key] = {
        "level": level,
        "boss_id": bid,
        "type": "B",
        "phase": "victory",
        "zh-CN": zh, "en-US": en, "ja-JP": ja, "ko-KR": ko,
    }

for l in LANGS:
    d = os.path.join(base, l, "boss")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "battle.json"), "w", encoding="utf-8") as f:
        json.dump(per_lang[l], f, ensure_ascii=False, indent=2)

# 2) 合并对照版（便于审核/对齐审阅）
with open(os.path.join(base, "boss", "battle.aligned.json"), "w", encoding="utf-8") as f:
    json.dump(combined, f, ensure_ascii=False, indent=2)

print("generated:")
for l in LANGS:
    print(f"  {base}/{l}/boss/battle.json  ({len(per_lang[l])} keys)")
print(f"  {base}/boss/battle.aligned.json  ({len(combined)} keys)")

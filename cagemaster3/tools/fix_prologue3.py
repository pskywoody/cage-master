#!/usr/bin/env python3
import json

with open('D:/killersudoku/cagemaster3/data/chapters.json', 'r', encoding='utf-8') as f:
    ch = json.load(f)

new_prologue = [
    # 1. Title card
    {
        'type': 'title',
        'text': '第一章',
        'subtitle': '初识笼中密码 · 楔子'
    },
    # 2. Scene1 bg + shenmo portrait appears
    {
        'speaker': '沈墨',
        'text': '',
        'side': 'left',
        'emotion': 'confident',
        'bg': 'assets/images/backgrounds/bg_scene1_single_door_v2.jpg'
    },
    # 3. K-734 item
    {
        'speaker': '旁白',
        'text': '',
        'isNarration': True,
        'item': 'file-k734'
    },
    # 4. Narrator text about the letter
    {
        'speaker': '旁白',
        'text': '一封匿名信带你来到这里——信上只有一行字："档案编号K-734。如果你能解开这一局，就能找到我。"',
        'isNarration': True,
        'sfx': 'playDoorOpen'
    },
    # 5. Shenmo speaks
    {
        'speaker': '沈墨',
        'text': '……我来了。',
        'side': 'left',
        'emotion': 'confident',
        'voiceId': 'SM_01'
    },
    # 6. Scene2 bg + footstep + 守笼人
    {
        'speaker': '旁白',
        'text': '守笼人从阴影中走出，脚步声在空旷的大厅中回响',
        'isNarration': True,
        'bg': 'assets/images/backgrounds/bg_scene2_archive_hall.jpg',
        'sfx': 'playFootstep'
    },
    {
        'speaker': '守笼人',
        'text': '欢迎来到数字档案馆。我是守笼人。这里记录着所有被锁住的数字，也记录着被锁住的过去。',
        'side': 'right',
        'emotion': 'default',
        'voiceId': 'CK_01'
    },
    # 7. 莹莹
    {
        'speaker': '旁白',
        'text': '莹莹从书架后探出头，手里抱着一本比她脸还大的旧册子',
        'isNarration': True,
        'sfx': 'playFootstep'
    },
    {
        'speaker': '莹莹',
        'text': '哇！来新人啦！我叫莹莹，比你早到两个月！',
        'side': 'right',
        'emotion': 'energetic',
        'voiceId': 'J_01'
    },
    {
        'speaker': '莹莹',
        'text': '这地方特——别——大——我第一天来的时候为了找厕所，在里面迷路了三天三夜！',
        'side': 'right'
    },
    # 8. 阿妍
    {
        'speaker': '旁白',
        'text': '阿妍从书架另一侧走出，手里拿着一支笔，没抬头',
        'isNarration': True
    },
    {
        'speaker': '阿妍',
        'text': '阿妍。比你早来三周。',
        'side': 'right',
        'emotion': 'calm',
        'voiceId': 'R_001'
    },
    {
        'speaker': '旁白',
        'text': '阿妍合上笔记，终于看向沈墨',
        'isNarration': True
    },
    {
        'speaker': '阿妍',
        'text': '这封信的内容，我已经确认过了——是真的。这间档案馆确实藏着什么。',
        'side': 'right',
        'emotion': 'calm',
        'voiceId': 'R_006'
    },
    # 9. 守笼人
    {
        'speaker': '守笼人',
        'text': '无论你们各自抱着什么目的而来，在这间档案馆里，规则是第一位的。',
        'side': 'right',
        'emotion': 'serious',
        'voiceId': 'CK_02'
    },
    {
        'speaker': '守笼人',
        'text': '从今天起，你们将从最基础的4×4盘面学起。每行、每列、每个2×2小宫格里，数字只能出现一次。',
        'side': 'right',
        'emotion': 'serious',
        'voiceId': 'CK_03'
    },
    # 10. 莹莹
    {
        'speaker': '旁白',
        'text': '莹莹举手',
        'isNarration': True
    },
    {
        'speaker': '莹莹',
        'text': '报告！我已经能背了！第一项：每行数字不重复！第二项：每列数字不重复！第三项：2×2宫格数字不重复！',
        'side': 'right',
        'emotion': 'confident',
        'voiceId': 'J_04'
    },
    # 11. Final
    {
        'speaker': '旁白',
        'text': '守笼人看了她一眼',
        'isNarration': True
    },
    {
        'speaker': '守笼人',
        'text': '……准备好了吗？',
        'side': 'right',
        'emotion': 'default',
        'voiceId': 'CK_04'
    }
]

ch['chapters'][0]['prologue'] = new_prologue

with open('D:/killersudoku/cagemaster3/data/chapters.json', 'w', encoding='utf-8') as f:
    json.dump(ch, f, ensure_ascii=False, indent=2)

print('Prologue rewritten: %d lines' % len(new_prologue))

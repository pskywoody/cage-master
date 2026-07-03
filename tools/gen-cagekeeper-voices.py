"""
守笼人配音重生成脚本
- 音色：zh-CN-YunyeNeural（云野 - 中年沉稳男声）
- 每句独立情绪参数（语速/音调）
- 强制覆盖现有文件
"""
import asyncio
import edge_tts
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'game-src', 'assets', 'audio', 'voices')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 守笼人基础音色
BASE_VOICE = 'zh-CN-YunyeNeural'

# 每句台词的情绪定制参数
# rate: 语速 (+快 -慢)
# pitch: 音调 (+高 -低)
CK_DIALOGUES = [
    # ---- 第一章：引导 ----
    ('VO_CK_01', '欢迎来到档案室。',
     {'rate': '-8%', 'pitch': '-3Hz'}),   # 平静温和，长者迎接
    ('VO_CK_02', '我是这里的记录者。',
     {'rate': '-8%', 'pitch': '-3Hz'}),   # 平静温和，自我介绍
    ('VO_CK_03', '这些档案被数字密码锁住了。',
     {'rate': '-12%', 'pitch': '-5Hz'}),  # 严肃沉稳，讲述规则
    ('VO_CK_04', '解开它们，你就能找到真相。',
     {'rate': '-10%', 'pitch': '-4Hz'}),  # 严肃引导，略带鼓励

    # ---- 赞许 ----
    ('VO_CK_05', '嗯……做得不错。',
     {'rate': '-5%', 'pitch': '-2Hz'}),   # 欣慰赞许，微微点头
    ('VO_CK_06', '你比我想象中敏锐。',
     {'rate': '-5%', 'pitch': '-2Hz'}),   # 欣赏认可

    # ---- 惊讶 ----
    ('VO_CK_07', '什么？！',
     {'rate': '+15%', 'pitch': '+5Hz'}),  # 震惊，脱口而出
    ('VO_CK_08', '你居然能看穿这一层……',
     {'rate': '+5%', 'pitch': '+2Hz'}),   # 惊讶感慨，难以置信

    # ---- 沉思 ----
    ('VO_CK_09', '让我想想……',
     {'rate': '-18%', 'pitch': '-4Hz'}),  # 沉思，语速极慢

    # ---- 沉重/感慨 ----
    ('VO_CK_10', '那份档案……的确有些蹊跷。',
     {'rate': '-12%', 'pitch': '-6Hz'}),  # 沉重感慨，回忆往事
    ('VO_CK_11', '我没想到……他竟然会走到那一步。',
     {'rate': '-15%', 'pitch': '-7Hz'}),  # 遗憾悲伤，痛惜

    # ---- 第二章：Boss考验 ----
    ('VO_CK_12', '看来，是时候考验你真正的实力了。',
     {'rate': '-10%', 'pitch': '-6Hz'}),  # 威压考验，导师宣战
    ('VO_CK_13', '作为你的导师，我不会手下留情。',
     {'rate': '-8%', 'pitch': '-5Hz'}),   # 严肃坚定

    # ---- 败北/欣慰 ----
    ('VO_CK_14', '你……竟然做到了这一步。',
     {'rate': '+8%', 'pitch': '+3Hz'}),   # 震撼，不敢置信
    ('VO_CK_15', '很好，你已经超越了我。去揭开真相吧。',
     {'rate': '-8%', 'pitch': '-3Hz'}),   # 欣慰托付，传承之意

    # ---- 终章 ----
    ('VO_CK_16', '小心。这是他真正的实力，不要留手。',
     {'rate': '-10%', 'pitch': '-5Hz'}),  # 郑重告诫
    ('VO_CK_17', '恭喜你，真正的大师。',
     {'rate': '-5%', 'pitch': '-2Hz'}),   # 欣慰认可，微微点头
    ('VO_CK_18', '七卷秘术已全部传承。档案之道，薪火不息。',
     {'rate': '-12%', 'pitch': '-4Hz'}),  # 庄严宣告，仪式感
]


async def gen_one(vo_id, text, params):
    outfile = os.path.join(OUTPUT_DIR, f'{vo_id}.mp3')

    # 备份旧文件（如果存在）
    if os.path.exists(outfile):
        backup = outfile + '.bak'
        if not os.path.exists(backup):
            os.rename(outfile, backup)
            print(f'  [BACKUP] {vo_id}.mp3 -> .bak')

    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(
                text,
                BASE_VOICE,
                rate=params['rate'],
                pitch=params['pitch']
            )
            await communicate.save(outfile)
            size = os.path.getsize(outfile)
            print(f'  [OK] {vo_id} ({params["rate"]}, {params["pitch"]}): {text} [{size} bytes]')
            return True
        except Exception as e:
            if attempt < 2:
                print(f'  [RETRY {attempt+1}] {vo_id}: {e}')
                await asyncio.sleep(3)
            else:
                print(f'  [FAIL] {vo_id}: {e}')
                # 失败时恢复备份
                backup = outfile + '.bak'
                if os.path.exists(backup):
                    os.rename(backup, outfile)
                    print(f'  [RESTORE] {vo_id} restored from backup')
                return False


async def main():
    print('=' * 60)
    print('  守笼人配音重生成')
    print(f'  音色: {BASE_VOICE}（云野 - 中年沉稳男声）')
    print(f'  共 {len(CK_DIALOGUES)} 句，每句独立情绪参数')
    print('=' * 60)

    ok = 0
    fail = 0
    for vo_id, text, params in CK_DIALOGUES:
        result = await gen_one(vo_id, text, params)
        if result:
            ok += 1
        else:
            fail += 1
        await asyncio.sleep(0.5)  # 避免限流

    print()
    print('=' * 60)
    print(f'  完成！ 成功: {ok}  失败: {fail}')
    print(f'  输出目录: {OUTPUT_DIR}')
    print('  旧文件已备份为 .bak，确认满意后可删除')
    print('=' * 60)


if __name__ == '__main__':
    asyncio.run(main())

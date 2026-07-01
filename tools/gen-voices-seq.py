"""Sequential Edge TTS generator - one at a time to avoid rate limits"""
import asyncio
import edge_tts
import os
import time

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'game-src', 'assets', 'audio', 'voices')
os.makedirs(OUTPUT_DIR, exist_ok=True)

VOICES = {
    'VO_CK': {'voice': 'zh-CN-YunxiNeural', 'rate': '-5%', 'pitch': '-2Hz'},
    'VO_R':  {'voice': 'zh-CN-YunjianNeural', 'rate': '+5%', 'pitch': '+2Hz'},
    'VO_P':  {'voice': 'zh-CN-YunxiNeural', 'rate': '-15%', 'pitch': '-4Hz'},
    'VO_W':  {'voice': 'zh-CN-YunxiNeural', 'rate': '+10%', 'pitch': '+2Hz'},
    'VO_RE': {'voice': 'zh-CN-YunxiNeural', 'rate': '-15%', 'pitch': '-3Hz'},
    'VO_S':  {'voice': 'zh-CN-XiaoxiaoNeural', 'rate': '+0%', 'pitch': '+0Hz'},
}

DIALOGUES = [
    ('VO_CK_01', 'VO_CK', '欢迎来到档案室。'),
    ('VO_CK_02', 'VO_CK', '我是这里的记录者。'),
    ('VO_CK_03', 'VO_CK', '这些档案被数字密码锁住了。'),
    ('VO_CK_04', 'VO_CK', '解开它们，你就能找到真相。'),
    ('VO_CK_05', 'VO_CK', '嗯……做得不错。'),
    ('VO_CK_06', 'VO_CK', '你比我想象中敏锐。'),
    ('VO_CK_07', 'VO_CK', '什么？！'),
    ('VO_CK_08', 'VO_CK', '你居然能看穿这一层……'),
    ('VO_CK_09', 'VO_CK', '让我想想……'),
    ('VO_CK_10', 'VO_CK', '那份档案……的确有些蹊跷。'),
    ('VO_CK_11', 'VO_CK', '我没想到……他竟然会走到那一步。'),
    ('VO_R_01', 'VO_R', '嘿！你就是新来的档案侦探？'),
    ('VO_R_02', 'VO_R', '想进下一层？先过我这关！'),
    ('VO_R_03', 'VO_R', '哈哈，这题可没那么简单哦！'),
    ('VO_R_04', 'VO_R', '诶？！'),
    ('VO_R_05', 'VO_R', '你居然能解开？！'),
    ('VO_R_06', 'VO_R', '可恶！'),
    ('VO_R_07', 'VO_R', '我还没认真呢！'),
    ('VO_R_08', 'VO_R', '切……'),
    ('VO_R_09', 'VO_R', '算你厉害……'),
    ('VO_R_10', 'VO_R', '后面还有更难的！'),
    ('VO_P_01', 'VO_P', '你终于走到这一步了。'),
    ('VO_P_02', 'VO_P', '可惜，还不够。'),
    ('VO_P_03', 'VO_P', '呵……'),
    ('VO_P_04', 'VO_P', '你以为你看到的，就是全部？'),
    ('VO_P_05', 'VO_P', '那就让你亲身体会一下。'),
    ('VO_P_06', 'VO_P', '真正的笼中密码。'),
    ('VO_P_07', 'VO_P', '不可能！'),
    ('VO_P_08', 'VO_P', '我设下的锁岂是你能解的？！'),
    ('VO_P_09', 'VO_P', '你……你居然……'),
    ('VO_P_10', 'VO_P', '……结束了。'),
    ('VO_W_01', 'VO_W', '我就是星辰梭。'),
    ('VO_W_02', 'VO_W', '穿梭于逻辑之间的织网者。'),
    ('VO_W_03', 'VO_W', '你以为这就结束了？'),
    ('VO_W_04', 'VO_W', '远着呢。'),
    ('VO_W_05', 'VO_W', '有趣……'),
    ('VO_W_06', 'VO_W', '你居然能看穿这层结构。'),
    ('VO_W_07', 'VO_W', '别得意。'),
    ('VO_W_08', 'VO_W', '我还没有用出真正的杀招。'),
    ('VO_W_09', 'VO_W', '……你赢了。'),
    ('VO_RE_01', 'VO_RE', '残局已激活。'),
    ('VO_RE_02', 'VO_RE', '验证开始。'),
    ('VO_RE_03', 'VO_RE', '检测到异常逻辑输入。'),
    ('VO_RE_04', 'VO_RE', '拒绝。'),
    ('VO_RE_05', 'VO_RE', '残局……被破解。'),
    ('VO_RE_06', 'VO_RE', '逻辑崩塌中……'),
    ('VO_S_01', 'VO_S', '异议！'),
    ('VO_S_02', 'VO_S', '档案碎片已收集。'),
    ('VO_S_03', 'VO_S', '恭喜通关。'),
]

async def gen_one(vo_id, prefix, text):
    cfg = VOICES[prefix]
    outfile = os.path.join(OUTPUT_DIR, f'{vo_id}.mp3')
    if os.path.exists(outfile) and os.path.getsize(outfile) > 1000:
        print(f'  [SKIP] {vo_id}')
        return True
    for attempt in range(3):
        try:
            c = edge_tts.Communicate(text, cfg['voice'], rate=cfg['rate'], pitch=cfg['pitch'])
            await c.save(outfile)
            print(f'  [OK] {vo_id}: {text}')
            return True
        except Exception as e:
            if attempt < 2:
                print(f'  [RETRY {attempt+1}] {vo_id}: {e}')
                await asyncio.sleep(3)
            else:
                print(f'  [FAIL] {vo_id}: {e}')
                return False

async def main():
    print(f'Generating {len(DIALOGUES)} voices sequentially...')
    ok = 0
    fail = 0
    skip = 0
    for vo_id, prefix, text in DIALOGUES:
        outfile = os.path.join(OUTPUT_DIR, f'{vo_id}.mp3')
        if os.path.exists(outfile) and os.path.getsize(outfile) > 1000:
            skip += 1
            print(f'  [SKIP] {vo_id}')
            continue
        result = await gen_one(vo_id, prefix, text)
        if result:
            ok += 1
        else:
            fail += 1
        await asyncio.sleep(0.5)
    print(f'\nDone! OK={ok} FAIL={fail} SKIP={skip}')

if __name__ == '__main__':
    asyncio.run(main())

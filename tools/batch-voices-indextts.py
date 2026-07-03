"""
批量生成守笼人 + 设局人配音
一次加载模型，生成所有角色，节省时间
"""
import sys
import time
from pathlib import Path

TOOLS_DIR = Path(__file__).parent
INDEX_TTS_DIR = TOOLS_DIR / 'index-tts'
sys.path.insert(0, str(INDEX_TTS_DIR))

CK_REF = str(TOOLS_DIR / 'cagekeeper_ref.mp3')
P_REF = str(TOOLS_DIR / 'plotter_ref.mp3')
OUT_DIR = TOOLS_DIR.parent / 'game-src' / 'assets' / 'audio' / 'voices'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 台词配置
import importlib.util
spec = importlib.util.spec_from_file_location("gen_voices", str(TOOLS_DIR / 'gen-voices-indextts.py'))
gen_voices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen_voices)
CK_DIALOGUES = gen_voices.CK_DIALOGUES
PLOTTER_DIALOGUES = gen_voices.PLOTTER_DIALOGUES

print('=' * 60)
print('IndexTTS-2 批量配音生成')
print(f'  守笼人: {len(CK_DIALOGUES)} 句')
print(f'  设局人: {len(PLOTTER_DIALOGUES)} 句')
print(f'  合计: {len(CK_DIALOGUES) + len(PLOTTER_DIALOGUES)} 句')
print('=' * 60)

# 加载模型
print('\n加载模型...')
t0 = time.time()
from indextts.infer_v2 import IndexTTS2

model_dir = INDEX_TTS_DIR / 'checkpoints'
tts = IndexTTS2(
    cfg_path=str(model_dir / 'config.yaml'),
    model_dir=str(model_dir),
    use_fp16=True,
    use_cuda_kernel=False,
    use_deepspeed=False
)
print(f'模型加载完成: {time.time() - t0:.1f}s')

def generate_batch(name, dialogues, ref_audio):
    """生成一批配音"""
    print(f'\n{"=" * 60}')
    print(f'生成 {name} 配音 ({len(dialogues)} 句)')
    print(f'参考音频: {ref_audio}')
    print(f'输出目录: {OUT_DIR}')
    print('=' * 60)

    ok = 0
    fail = 0
    skip = 0
    total_time = 0

    for i, (vo_id, text, params) in enumerate(dialogues):
        outfile = OUT_DIR / f'{vo_id}.wav'

        if outfile.exists() and outfile.stat().st_size > 1000:
            print(f'  [{i+1:2d}/{len(dialogues)}] [SKIP] {vo_id}: 已存在')
            skip += 1
            continue

        emo = params.get('emo')

        try:
            t1 = time.time()
            kwargs = {
                'spk_audio_prompt': ref_audio,
                'text': text,
                'output_path': str(outfile),
                'verbose': False,
            }
            if emo:
                kwargs['emo_audio_prompt'] = emo
                kwargs['emo_alpha'] = 0.9

            tts.infer(**kwargs)

            dur = time.time() - t1
            total_time += dur
            size_kb = outfile.stat().st_size / 1024

            # 获取音频时长（粗略估算：22050Hz, 16bit, mono = 44100 bytes/秒）
            audio_sec = outfile.stat().st_size / 44100

            print(f'  [{i+1:2d}/{len(dialogues)}] [OK] {vo_id}: {text[:20]}... ({dur:.1f}s, {audio_sec:.1f}s音频, RTF={dur/audio_sec:.1f})')
            ok += 1

        except Exception as e:
            print(f'  [{i+1:2d}/{len(dialogues)}] [FAIL] {vo_id}: {e}')
            fail += 1

    print('-' * 60)
    print(f'完成！成功: {ok}  失败: {fail}  跳过: {skip}')
    print(f'总用时: {total_time:.1f}s')
    if ok > 0:
        print(f'平均每句: {total_time/ok:.1f}s')
    return ok, fail, skip

# 生成守笼人
ck_ok, ck_fail, ck_skip = generate_batch('守笼人', CK_DIALOGUES, CK_REF)

# 生成设局人
p_ok, p_fail, p_skip = generate_batch('设局人', PLOTTER_DIALOGUES, P_REF)

# 总结
print('\n' + '=' * 60)
print('全部完成！')
print('=' * 60)
print(f'守笼人: 成功{ck_ok} / 失败{ck_fail} / 跳过{ck_skip}')
print(f'设局人: 成功{p_ok} / 失败{p_fail} / 跳过{p_skip}')
print(f'输出目录: {OUT_DIR}')
print('=' * 60)

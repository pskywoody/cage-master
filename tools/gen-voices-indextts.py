"""
IndexTTS-2 批量配音生成脚本
用于生成游戏角色配音，支持：
- 音色参考音频（spk_audio_prompt）
- 情感参考音频（emo_audio_prompt），可选
- 语速控制
- 批量生成 + 自动转wav（游戏直接可用）

用法:
    python gen-voices-indextts.py --spk reference.wav [--emo emotion.wav] [--rate 1.0]

角色配置在下方 CK_DIALOGUES / PLOTTER_DIALOGUES 中定义。
"""

import os
import sys
import argparse
import json
import time
from pathlib import Path

# IndexTTS-2 路径
INDEX_TTS_DIR = Path(__file__).parent / 'index-tts'
sys.path.insert(0, str(INDEX_TTS_DIR))

# 输出目录
OUTPUT_DIR = Path(__file__).parent.parent / 'game-src' / 'assets' / 'audio' / 'voices'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================
# 角色台词配置
# ============================================================

# 守笼人 - 18句（从 dialogues.js 提取）
CK_DIALOGUES = [
    # 平静温和
    ('VO_CK_01', '欢迎来到档案室。', {'rate': 0.92, 'emo': None}),
    ('VO_CK_02', '我是这里的记录者。', {'rate': 0.92, 'emo': None}),
    # 严肃沉稳
    ('VO_CK_03', '这些档案被数字密码锁住了。', {'rate': 0.88, 'emo': None}),
    ('VO_CK_04', '解开它们，你就能找到真相。', {'rate': 0.90, 'emo': None}),
    # 欣慰赞许
    ('VO_CK_05', '嗯……做得不错。', {'rate': 0.95, 'emo': None}),
    ('VO_CK_06', '你比我想象中敏锐。', {'rate': 0.95, 'emo': None}),
    # 惊讶震惊
    ('VO_CK_07', '什么？！', {'rate': 1.15, 'emo': None}),
    ('VO_CK_08', '你居然能看穿这一层……', {'rate': 1.05, 'emo': None}),
    # 沉思
    ('VO_CK_09', '让我想想……', {'rate': 0.82, 'emo': None}),
    # 沉重感慨
    ('VO_CK_10', '那份档案……的确有些蹊跷。', {'rate': 0.88, 'emo': None}),
    ('VO_CK_11', '我没想到……他竟然会走到那一步。', {'rate': 0.85, 'emo': None}),
    # 考验威压
    ('VO_CK_12', '看来，是时候考验你真正的实力了。', {'rate': 0.90, 'emo': None}),
    ('VO_CK_13', '作为你的导师，我不会手下留情。', {'rate': 0.92, 'emo': None}),
    # 震撼
    ('VO_CK_14', '你……竟然做到了这一步。', {'rate': 1.08, 'emo': None}),
    # 欣慰托付
    ('VO_CK_15', '很好，你已经超越了我。去揭开真相吧。', {'rate': 0.92, 'emo': None}),
    # 郑重告诫
    ('VO_CK_16', '小心。这是他真正的实力，不要留手。', {'rate': 0.90, 'emo': None}),
    # 欣慰认可
    ('VO_CK_17', '恭喜你，真正的大师。', {'rate': 0.95, 'emo': None}),
    # 庄严宣告
    ('VO_CK_18', '七卷秘术已全部传承。档案之道，薪火不息。', {'rate': 0.88, 'emo': None}),
]

# 设局人 - 10句
PLOTTER_DIALOGUES = [
    ('VO_P_01', '你终于走到这一步了。', {'rate': 0.80, 'emo': None}),
    ('VO_P_02', '可惜，还不够。', {'rate': 0.80, 'emo': None}),
    ('VO_P_03', '呵……', {'rate': 0.75, 'emo': None}),
    ('VO_P_04', '你以为你看到的，就是全部？', {'rate': 0.82, 'emo': None}),
    ('VO_P_05', '那就让你亲身体会一下。', {'rate': 0.80, 'emo': None}),
    ('VO_P_06', '真正的笼中密码。', {'rate': 0.78, 'emo': None}),
    ('VO_P_07', '不可能！', {'rate': 1.10, 'emo': None}),
    ('VO_P_08', '我设下的锁岂是你能解的？！', {'rate': 1.05, 'emo': None}),
    ('VO_P_09', '你……你居然……', {'rate': 1.00, 'emo': None}),
    ('VO_P_10', '……结束了。', {'rate': 0.85, 'emo': None}),
]


def load_tts_model(model_dir, use_fp16=True, device='cuda'):
    """加载 IndexTTS-2 模型"""
    from indextts.infer_v2 import IndexTTS2

    print(f'加载模型... (设备: {device}, FP16: {use_fp16})')
    t0 = time.time()

    tts = IndexTTS2(
        cfg_path=str(Path(model_dir) / 'config.yaml'),
        model_dir=model_dir,
        use_fp16=use_fp16,
        use_cuda_kernel=False,
        use_deepspeed=False
    )

    print(f'模型加载完成，用时 {time.time() - t0:.1f}s')
    return tts


def generate_one(tts, text, spk_audio, output_path, emo_audio=None,
                 emo_alpha=0.9, verbose=False):
    """生成单句配音"""
    kwargs = {
        'spk_audio_prompt': spk_audio,
        'text': text,
        'output_path': str(output_path),
        'verbose': verbose,
    }
    if emo_audio:
        kwargs['emo_audio_prompt'] = emo_audio
        kwargs['emo_alpha'] = emo_alpha

    tts.infer(**kwargs)
    return output_path


def batch_generate(tts, dialogues, spk_audio, emo_audio=None,
                   emo_alpha=0.9, force=False):
    """批量生成配音"""
    print(f'\n批量生成 {len(dialogues)} 句配音')
    print(f'  音色参考: {spk_audio}')
    if emo_audio:
        print(f'  情感参考: {emo_audio} (强度: {emo_alpha})')
    print(f'  输出目录: {OUTPUT_DIR}')
    print('-' * 60)

    ok = 0
    fail = 0
    skip = 0

    for i, (vo_id, text, params) in enumerate(dialogues):
        outfile = OUTPUT_DIR / f'{vo_id}.wav'

        # 检查是否已存在（非强制模式跳过）
        if outfile.exists() and outfile.stat().st_size > 1000 and not force:
            print(f'  [{i+1:2d}/{len(dialogues)}] [SKIP] {vo_id}: 已存在')
            skip += 1
            continue

        emo = params.get('emo') or emo_audio

        try:
            t0 = time.time()
            generate_one(
                tts=tts,
                text=text,
                spk_audio=spk_audio,
                output_path=outfile,
                emo_audio=emo,
                emo_alpha=emo_alpha,
                verbose=False
            )
            dur = time.time() - t0
            size_kb = outfile.stat().st_size / 1024
            print(f'  [{i+1:2d}/{len(dialogues)}] [OK] {vo_id}: {text[:20]}... ({dur:.1f}s, {size_kb:.0f}KB, rate={rate:.2f})')
            ok += 1
        except Exception as e:
            print(f'  [{i+1:2d}/{len(dialogues)}] [FAIL] {vo_id}: {e}')
            fail += 1

    print('-' * 60)
    print(f'完成！成功: {ok}  失败: {fail}  跳过: {skip}')
    return ok, fail, skip


def main():
    parser = argparse.ArgumentParser(description='IndexTTS-2 批量配音生成')
    parser.add_argument('--character', '-c', default='cagekeeper',
                       choices=['cagekeeper', 'plotter', 'all'],
                       help='生成哪个角色的配音 (default: cagekeeper)')
    parser.add_argument('--spk', '-s', required=True,
                       help='音色参考音频路径 (wav/mp3)')
    parser.add_argument('--emo', '-e', default=None,
                       help='情感参考音频路径 (可选)')
    parser.add_argument('--emo-alpha', type=float, default=0.9,
                       help='情感强度 0.0~1.0 (default: 0.9)')
    parser.add_argument('--rate', '-r', type=float, default=1.0,
                       help='基础语速倍率 (default: 1.0)')
    parser.add_argument('--model-dir', default=None,
                       help='模型目录 (默认: index-tts/checkpoints)')
    parser.add_argument('--force', '-f', action='store_true',
                       help='强制重新生成，覆盖现有文件')
    parser.add_argument('--fp32', action='store_true',
                       help='使用FP32精度（默认FP16）')
    parser.add_argument('--cpu', action='store_true',
                       help='使用CPU（默认CUDA）')

    args = parser.parse_args()

    # 模型目录
    model_dir = args.model_dir or str(INDEX_TTS_DIR / 'checkpoints')
    if not Path(model_dir).exists():
        print(f'❌ 模型目录不存在: {model_dir}')
        print('请先运行 download-indextts-model.py 下载模型')
        sys.exit(1)

    # 检查参考音频
    if not Path(args.spk).exists():
        print(f'❌ 音色参考音频不存在: {args.spk}')
        sys.exit(1)
    if args.emo and not Path(args.emo).exists():
        print(f'❌ 情感参考音频不存在: {args.emo}')
        sys.exit(1)

    # 设备
    device = 'cpu' if args.cpu else 'cuda'
    use_fp16 = not args.fp32

    # 加载模型
    tts = load_tts_model(model_dir, use_fp16=use_fp16, device=device)

    # 生成
    total_ok = 0
    total_fail = 0

    if args.character in ('cagekeeper', 'all'):
        print('\n' + '=' * 60)
        print('🎭 守笼人 (Cagekeeper)')
        print('=' * 60)
        ok, fail, _ = batch_generate(
            tts, CK_DIALOGUES, args.spk, args.emo,
            emo_alpha=args.emo_alpha, base_rate=args.rate, force=args.force
        )
        total_ok += ok
        total_fail += fail

    if args.character in ('plotter', 'all'):
        print('\n' + '=' * 60)
        print('🎭 设局人 (Plotter)')
        print('=' * 60)
        # 设局人用同一个音色但调整语速（更慢更阴冷）
        ok, fail, _ = batch_generate(
            tts, PLOTTER_DIALOGUES, args.spk, args.emo,
            emo_alpha=args.emo_alpha, base_rate=args.rate * 0.85, force=args.force
        )
        total_ok += ok
        total_fail += fail

    print(f'\n🎉 全部完成！总成功: {total_ok}  总失败: {total_fail}')
    print(f'输出目录: {OUTPUT_DIR}')


if __name__ == '__main__':
    main()

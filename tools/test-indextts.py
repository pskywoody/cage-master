"""
快速测试 IndexTTS-2 生成效果
生成一句测试音频
"""
import sys
import time
from pathlib import Path

INDEX_TTS_DIR = Path(r'd:\killersudoku\tools\index-tts')
sys.path.insert(0, str(INDEX_TTS_DIR))

OUTPUT_DIR = Path(r'd:\killersudoku\game-src\assets\audio\voices')
MODEL_DIR = INDEX_TTS_DIR / 'checkpoints'

def main():
    from indextts.infer_v2 import IndexTTS2

    # 参考音频
    spk_audio = r'd:\killersudoku\tools\plotter_ref.mp3'

    # 测试文本
    test_texts = [
        ('test_plotter_01', '你终于走到这一步了。可惜，还不够。', 0.85),
    ]

    print('加载模型...')
    t0 = time.time()
    tts = IndexTTS2(
        cfg_path=str(MODEL_DIR / 'config.yaml'),
        model_dir=str(MODEL_DIR),
        use_fp16=True,
        use_cuda_kernel=False,
        use_deepspeed=False
    )
    print(f'模型加载完成，用时 {time.time() - t0:.1f}s')

    for vo_id, text, rate in test_texts:
        outfile = OUTPUT_DIR / f'_test_{vo_id}.wav'
        print(f'\n生成: {text}')
        print(f'  语速: {rate}')
        t1 = time.time()
        tts.infer(
            spk_audio_prompt=spk_audio,
            text=text,
            output_path=str(outfile),
            rate=rate,
            verbose=True
        )
        dur = time.time() - t1
        size_kb = outfile.stat().st_size / 1024
        print(f'  完成！用时 {dur:.1f}s，文件大小 {size_kb:.0f}KB')
        print(f'  输出: {outfile}')

    print('\n✅ 测试完成！')

if __name__ == '__main__':
    main()

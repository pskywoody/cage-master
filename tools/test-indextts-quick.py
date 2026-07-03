"""
快速测试 IndexTTS-2 是否能正常推理
生成1句守笼人试听 + 1句设局人试听
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

print('=' * 60)
print('IndexTTS-2 快速试听测试')
print('=' * 60)

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

# 测试1：守笼人
print('\n--- 守笼人试听 ---')
test_text = '欢迎来到档案室。我是这里的记录者。'
out_file = OUT_DIR / 'test_cagekeeper.wav'
t1 = time.time()
tts.infer(
    spk_audio_prompt=CK_REF,
    text=test_text,
    output_path=str(out_file),
    verbose=False
)
print(f'生成完成: {time.time() - t1:.1f}s')
print(f'输出: {out_file}')

# 测试2：设局人
print('\n--- 设局人试听 ---')
test_text2 = '你终于走到这一步了。可惜，还不够。'
out_file2 = OUT_DIR / 'test_plotter.wav'
t2 = time.time()
tts.infer(
    spk_audio_prompt=P_REF,
    text=test_text2,
    output_path=str(out_file2),
    verbose=False
)
print(f'生成完成: {time.time() - t2:.1f}s')
print(f'输出: {out_file2}')

print('\n' + '=' * 60)
print('测试完成！请试听两个文件确认音色。')
print('=' * 60)

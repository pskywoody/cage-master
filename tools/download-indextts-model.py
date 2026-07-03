"""
下载 IndexTTS-2 模型权重
使用 ModelScope 国内镜像加速
"""
import os
import sys

# 模型目录
MODEL_DIR = r'd:\killersudoku\tools\index-tts\checkpoints'
os.makedirs(MODEL_DIR, exist_ok=True)

print(f'模型将下载到: {MODEL_DIR}')
print('正在从 ModelScope 下载 IndexTTS-2 模型...')
print('(模型较大，约3-4GB，请耐心等待)')
print()

try:
    from modelscope import snapshot_download
    model_dir = snapshot_download(
        'IndexTeam/IndexTTS-2',
        cache_dir=MODEL_DIR,
        local_dir=MODEL_DIR
    )
    print(f'\n✅ 下载完成！模型目录: {model_dir}')
except Exception as e:
    print(f'\n❌ ModelScope下载失败: {e}')
    print('尝试 HuggingFace...')
    try:
        from huggingface_hub import snapshot_download
        model_dir = snapshot_download(
            'IndexTeam/IndexTTS-2',
            local_dir=MODEL_DIR
        )
        print(f'\n✅ 下载完成！模型目录: {model_dir}')
    except Exception as e2:
        print(f'\n❌ HuggingFace也失败: {e2}')
        sys.exit(1)

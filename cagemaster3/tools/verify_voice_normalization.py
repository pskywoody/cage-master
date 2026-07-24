"""
验证 cagemaster3 语音 ID 规范化结果
验证项：
1. chapters.json 中所有 voiceId 都以 VO_ 开头
2. 每个 voiceId 对应的 .wav 文件都存在
3. 统计各角色的语音数量

使用方法：
  python tools/verify_voice_normalization.py
"""
import json
import os
import re
from collections import defaultdict

CHAPTERS_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'chapters.json')
VOICES_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio', 'voices')

CHARACTER_MAP = {
    'CK': '守笼人',
    'J': '莹莹',
    'SM': '沈墨',
    'R': '阿妍',
    'P': '设局人',
    'SS': '神秘角色',
}

def find_all_voice_ids(obj, path=""):
    """递归查找所有 voiceId 字段"""
    results = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            current_path = f"{path}.{key}" if path else key
            if key == 'voiceId' and isinstance(value, str):
                results.append((value, current_path))
            elif isinstance(value, (dict, list)):
                results.extend(find_all_voice_ids(value, current_path))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            current_path = f"{path}[{i}]"
            if isinstance(item, (dict, list)):
                results.extend(find_all_voice_ids(item, current_path))
    return results

def get_character_prefix(voice_id):
    """从 voiceId 中提取角色前缀"""
    match = re.match(r'^VO_([A-Z]+)_', voice_id)
    if match:
        return match.group(1)
    return 'UNKNOWN'

def main():
    print("=" * 60)
    print("cagemaster3 语音 ID 规范化验证报告")
    print("=" * 60)
    
    chapters_path = os.path.normpath(CHAPTERS_PATH)
    voices_dir = os.path.normpath(VOICES_DIR)
    
    # 1. 读取 chapters.json
    print("\n【1】读取 chapters.json...")
    with open(chapters_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    voice_ids = find_all_voice_ids(data)
    print(f"   总共找到 {len(voice_ids)} 个 voiceId 引用")
    
    # 2. 验证所有 voiceId 都以 VO_ 开头
    print("\n【2】验证 voiceId 格式（是否都以 VO_ 开头）...")
    invalid_ids = []
    for vid, path in voice_ids:
        if not vid.startswith('VO_'):
            invalid_ids.append((vid, path))
    
    if invalid_ids:
        print(f"   失败！发现 {len(invalid_ids)} 个不符合格式的 voiceId：")
        for vid, path in invalid_ids[:10]:
            print(f"     - {vid}  @  {path}")
        if len(invalid_ids) > 10:
            print(f"     ... 还有 {len(invalid_ids) - 10} 个")
    else:
        print("   通过！所有 voiceId 都以 VO_ 开头")
    
    # 3. 获取语音文件列表
    print("\n【3】扫描语音文件...")
    all_files = os.listdir(voices_dir)
    wav_files = [f for f in all_files if f.endswith('.wav')]
    wav_set = set(wav_files)
    
    # 统计文件中的角色分布
    file_char_counts = defaultdict(int)
    for f in wav_files:
        prefix = get_character_prefix(f[:-4])
        file_char_counts[prefix] += 1
    
    print(f"   共找到 {len(wav_files)} 个 .wav 文件")
    print("   文件角色分布：")
    for prefix, count in sorted(file_char_counts.items()):
        char_name = CHARACTER_MAP.get(prefix, prefix)
        print(f"     {prefix} ({char_name}): {count} 个文件")
    
    # 4. 验证每个唯一的 voiceId 对应的文件是否存在
    print("\n【4】验证 voiceId 对应文件是否存在...")
    unique_voice_ids = sorted(set(vid for vid, _ in voice_ids))
    missing_files = []
    
    for vid in unique_voice_ids:
        filename = vid + '.wav'
        if filename not in wav_set:
            missing_files.append(vid)
    
    if missing_files:
        print(f"   警告：{len(missing_files)} 个 voiceId 缺少对应文件：")
        for vid in missing_files:
            print(f"     - {vid}")
    else:
        print(f"   通过！所有 {len(unique_voice_ids)} 个唯一 voiceId 都有对应的 .wav 文件")
    
    # 5. 统计 chapters.json 中的角色语音数量
    print("\n【5】chapters.json 中各角色语音引用统计：")
    char_counts = defaultdict(int)
    char_unique_ids = defaultdict(set)
    
    for vid, _ in voice_ids:
        prefix = get_character_prefix(vid)
        char_counts[prefix] += 1
        char_unique_ids[prefix].add(vid)
    
    print(f"   {'角色':<8} {'角色名':<10} {'引用次数':<10} {'唯一ID数':<10}")
    print(f"   {'-'*8} {'-'*10} {'-'*10} {'-'*10}")
    total_refs = 0
    total_unique = 0
    for prefix in sorted(char_counts.keys()):
        char_name = CHARACTER_MAP.get(prefix, prefix)
        refs = char_counts[prefix]
        unique = len(char_unique_ids[prefix])
        total_refs += refs
        total_unique += unique
        print(f"   {prefix:<8} {char_name:<10} {refs:<10} {unique:<10}")
    print(f"   {'-'*8} {'-'*10} {'-'*10} {'-'*10}")
    print(f"   {'合计':<8} {'':<10} {total_refs:<10} {total_unique:<10}")
    
    # 6. 检查文件中是否还有非 VO_ 前缀的 .wav 文件
    print("\n【6】检查是否还有非 VO_ 前缀的 .wav 文件...")
    non_vo_files = [f for f in wav_files if not f.startswith('VO_')]
    if non_vo_files:
        print(f"   警告：发现 {len(non_vo_files)} 个非 VO_ 前缀的文件：")
        for f in non_vo_files:
            print(f"     - {f}")
    else:
        print("   通过！所有 .wav 文件都以 VO_ 开头")
    
    # 总结
    print("\n" + "=" * 60)
    print("验证总结")
    print("=" * 60)
    all_passed = len(invalid_ids) == 0 and len(non_vo_files) == 0
    if all_passed:
        print("  所有验证项通过！")
    else:
        print("  存在问题，请查看上方警告信息。")
    print(f"  - voiceId 总数：{len(voice_ids)}")
    print(f"  - 唯一 voiceId 数：{len(unique_voice_ids)}")
    print(f"  - 语音文件总数：{len(wav_files)}")
    print(f"  - 缺失文件数：{len(missing_files)}")
    print("=" * 60)

if __name__ == '__main__':
    main()

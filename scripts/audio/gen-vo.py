#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-vo.py — CageMaster4 人物配音生成器（IndexTTS2 本地）
落盘到: D:/killersudoku/cagemaster4/assets/audio_next/voice/<CODE>/VO_<CODE>_####.wav

设计依据: 音频制作决策锁定-2026-08-11.md §一(VO 码) / §五(混合式 VO) / §七(IndexTTS2)
  - VO 码: 薇拉=V / 伊藤=I / 苏晚=W / 山本=Y / 沈墨补录=SM
  - 录制前强制跑"数字→汉字 / ×→乘 / =→是"清洗（见 莹莹配音台词问题分析报告）
  - 逆转裁判混合式：叙事全量 + 关内关键句（由 manifest 的 scope 标注区分）

两阶段产物:
  1. clean_vo_text() 清洗函数 —— 任何管线都应先过这一道（可单独 import 复用）
  2. 本地 IndexTTS2 推理 —— 按角色声线 + 情绪参考音批量出 wav

依赖（仅 --live 需要）: indextts（本地已装）
用法:
  python gen-vo.py --demo            # 演示清洗（不依赖模型）
  python gen-vo.py --manifest vo_lines.json   # 按清单出 VO（需 --live 才真推理）
  python gen-vo.py --manifest vo_lines.json --only V   # 只出薇拉
  python gen-vo.py --live --manifest vo_lines.json
"""

import os
import sys
import json
import argparse

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE_ROOT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'audio_next', 'voice'))

# ============================================================
# 1. 文本清洗（录音前必过）
#    依据 莹莹配音台词问题分析报告：数字→汉字 / ×→乘 / =→是
#    另补常见算符，避免 TTS 念成字母/符号。
# ============================================================
_DIGIT_CN = {
    '0': '零', '1': '一', '2': '二', '3': '三', '4': '四',
    '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
}
# 两位数及以上：逐位读（如 12 → 一二），符合中文配音习惯；可改为 "十二" 规则按需调整
_OP_MAP = {
    '×': '乘', 'x': '乘', 'X': '乘',
    '=': '是', '÷': '除以', '＋': '加', '+': '加',
    '－': '减', '-': '减', '%': '百分之',
    '≈': '约等于', ':': '比',
}

def _digits_to_cn(text: str) -> str:
    """把连续数字逐位转汉字（TTS 友好）。保留原串其它字符。"""
    out = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c.isdigit():
            j = i
            while j < n and text[j].isdigit():
                j += 1
            for d in text[i:j]:
                out.append(_DIGIT_CN.get(d, d))
            i = j
        else:
            out.append(c)
            i += 1
    return ''.join(out)

def clean_vo_text(text: str) -> str:
    """配音文本清洗：算符映射 + 数字转汉字。"""
    if text is None:
        return ''
    t = str(text)
    for op, cn in _OP_MAP.items():
        t = t.replace(op, cn)
    t = _digits_to_cn(t)
    return t

# ============================================================
# 2. 角色声线配置（写盘前请按实际替换 ref_wav / emotion）
#    说明: IndexTTS2 支持"参考音克隆 + 情绪参考音"。下列 ref_wav 留空时
#    用模型默认音色；建议每个角色给一段 3–6s 干净参考音得到稳定声线。
#    emotion 仅作标注，真正情绪由"情绪参考音"控制（IndexTTS2 机制），
#    也可在推理时传入对应的 emotion_audio。
# ============================================================
VOICE_PROFILES = {
    'V':  dict(name='薇拉',   ref_wav=None, speed=1.0, note='正式/抽象/否定多；句长后期骤短'),
    'I':  dict(name='伊藤',   ref_wav=None, speed=0.95, note='官僚/档案/条件句；昭和文语感'),
    'W':  dict(name='苏晚',   ref_wav=None, speed=1.05, note='周目1 唯一登记；青年女性'),
    'Y':  dict(name='山本',   ref_wav=None, speed=0.9,  note='反派；低沉/压迫'),
    'SM': dict(name='沈墨(补录)', ref_wav=None, speed=1.0, note='复用既有 VO_SM 声线，仅补缺口'),
}

# ============================================================
# 3. IndexTTS2 推理客户端（仅 --live 用）
#    接法：按你本地 indextts 的入口微调 infer 签名即可。
# ============================================================
def indextts_infer(text, out_path, ref_wav=None, speed=1.0, emotion_audio=None):
    """
    本地 IndexTTS2 推理占位。请按你的部署改:
        from indextts.infer import IndexTTS
        tts = IndexTTS(model_dir="<your_model_dir>", cfg_path="<cfg>")
        tts.infer(text, audio_prompt=ref_wav, emotion_audio=emotion_audio,
                  speed=speed, output=out_path)
    未接入时抛 NotImplementedError（--demo / 无 --live 不会触发）。
    """
    raise NotImplementedError('IndexTTS2 未接入：请在 indextts_infer() 内接你的本地入口')

# ============================================================
# 4. 主流程
# ============================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--demo', action='store_true', help='演示清洗，不依赖模型')
    ap.add_argument('--manifest', help='VO 清单 JSON 路径（list[{code,id,text,scope?,emotion?}]）')
    ap.add_argument('--only', help='只处理某角色码，如 V')
    ap.add_argument('--live', action='store_true', help='调用 IndexTTS2 真实推理（需本地模型）')
    args = ap.parse_args()

    # 演示模式
    if args.demo or not args.manifest:
        samples = [
            "这一格是 3，那一格是 5，乘积 15。",
            " cages 的和 = 14，9 已成。",
            "2 × 7 = 14，记住。",
            "比较 4 与 8，取小者。",
        ]
        print('=== clean_vo_text 演示 ===')
        for s in samples:
            print(f'  原: {s}')
            print(f'  净: {clean_vo_text(s)}')
        if not args.manifest:
            print('\n[i] 传入 --manifest vo_lines.json 以批量出 VO；'
                  '或 --demo 仅看清洗效果。')
        return

    with open(args.manifest, 'r', encoding='utf-8') as f:
        lines = json.load(f)
    if args.only:
        lines = [l for l in lines if l.get('code') == args.only]
    if not lines:
        print(f'[!] manifest 为空或 --only={args.only} 无匹配')
        sys.exit(1)

    # 先过清洗，打印预览
    print(f'[i] 读取 {len(lines)} 条；清洗预览（前 5）:')
    for l in lines[:5]:
        raw = l.get('text', '')
        print(f'  [{l.get("code")}] {raw!r} -> {clean_vo_text(raw)!r}')

    if not args.live:
        print('\n[i] 默认不推理（无 --live）。清洗后的文本已预览，可安全进录音。')
        print('[i] 加 --live 调用本地 IndexTTS2 落盘到 assets/audio_next/voice/<CODE>/。')
        return

    # ---- live 模式 ----
    print('[live] 调用 IndexTTS2 生成…')
    done = 0
    failed = []
    for l in lines:
        code = l.get('code')
        if code not in VOICE_PROFILES:
            failed.append({'id': l.get('id'), 'error': f'未知角色码 {code}'})
            continue
        prof = VOICE_PROFILES[code]
        out_dir = os.path.join(VOICE_ROOT, code)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f'VO_{code}_{l.get("id","0000")}.wav')
        cleaned = clean_vo_text(l.get('text', ''))
        try:
            indextts_infer(cleaned, out_path, ref_wav=prof['ref_wav'],
                           speed=prof['speed'], emotion_audio=l.get('emotion_audio'))
            done += 1
            print(f'  [✓] VO_{code}_{l.get("id")}.wav')
        except Exception as e:
            failed.append({'id': l.get('id'), 'error': str(e)})
            print(f'  [✗] VO_{code}_{l.get("id")} -> {e}')
    print(f'\n[完成] 成功 {done}/{len(lines)}；失败 {len(failed)}')

if __name__ == '__main__':
    main()

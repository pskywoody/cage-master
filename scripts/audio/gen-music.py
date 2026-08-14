#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-music.py — CageMaster4 分层主题乐生成器（换剧本后重适配）
落盘到: D:/killersudoku/cagemaster4/assets/audio_next/bgm/

设计依据: 音频制作决策锁定-2026-08-11.md
  - 多 layer 情绪/节奏驱动音乐（4 stem: bed/pulse/motif/tension）
  - 11 段主题乐(intro+7章+outro+victory+fail) × 4 stem
  - 4 段人物 motif(SM/V/I/设局共享) × 2 变体(calm/tense)
  - 主工具 = MiniMax（与现有 16 首同厂牌，音色统一）；备用 = ACE-Step 1.5

两套产物:
  1. ALWAYS 写出 assets/audio_next/bgm/prompt_manifest.json —— 完整提示词包，
     即使无网络/无 KEY 也能直接喂给 MiniMax 网页端或本地 ACE-Step（drop-in 同 prompt 表）。
  2. 若设置 MINIMAX_API_KEY + --live：调用 MiniMax 音乐 API 真实生成并落盘 mp3。

依赖（仅 live 模式需要）: requests
用法:
  python gen-music.py                 # 仅产出 prompt_manifest.json（推荐先跑这个核对手感）
  python gen-music.py --live          # 调 MiniMax 真实生成（需 MINIMAX_API_KEY 与 MINIMAX_GROUP_ID）
  python gen-music.py --only chapter_3
  python gen-music.py --dry-run       # 同默认，打印提示词不写盘（quiet 调试）

注意: MiniMax 音乐为异步任务（约 30–60s/条）。脚本对每条做 submit→poll→download，
      单条失败不影响其它条，失败项记入 manifest 的 "failed" 列表，可重试。
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

# ============================================================
# 0. 常量 / 路径
# ============================================================
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'audio_next', 'bgm'))
MANIFEST_PATH = os.path.join(OUT_DIR, 'prompt_manifest.json')

# 沿用 engine 的 BGM_BPM_MAP（audio-service.js）
BPM = {
    'intro': 96, 'chapter_1': 100, 'chapter_2': 105, 'chapter_3': 108,
    'chapter_4': 112, 'chapter_5': 116, 'chapter_6': 120, 'chapter_7': 124,
    'outro': 100, 'victory': 128, 'fail': 84,
}

# ============================================================
# 1. 4 stem 的差异化提示词骨架（英文，MiniMax 音乐端为英文语义）
#    —— 关键：每个 stem 严格限定"只含一类素材"，保证叠层不打架、可独立调音量
# ============================================================
STEM_SPEC = {
    'bed': {
        'label': '铺底和声层',
        'en': ("1941 Shanghai noir film score. Sustained harmonic BED only: warm low "
               "strings (cello and double bass), soft grand-piano chord stabs, distant "
               "reed/oboe pad. NO percussion, NO drums, NO lead melody. Slow, spacious, "
               "{emo}. Tempo around {bpm} BPM. Seamless loop, perfect crossfade at ends. "
               "Cinematic, melancholic Republican-era Shanghai spy atmosphere."),
    },
    'pulse': {
        'label': '节奏脉冲层',
        'en': ("1941 Shanghai noir RHYTHM layer only. Sparse ethnic/period percussion: "
               "woodblock, muffled taiko low tom, brushed snare, soft kick. NO melody, "
               "NO harmonic pad, NO strings. Steady minimalist pulse at {bpm} BPM, dry "
               "and tense, spy-thriller groove. Seamless loop. {emo}."),
    },
    'motif': {
        'label': '旋律动机层',
        'en': ("1941 Shanghai noir MELODY motif only. {instr} melody line over "
               "silence, NO drums, NO harmonic bed, NO backing. {emo} lyrical phrase, "
               "8 to 16 bars, memorable and hummable. Seamless loop. Cinematic spy theme, "
               "tempo around {bpm} BPM."),
    },
    'tension': {
        'label': '紧张氛围层',
        'en': ("1941 Shanghai noir TENSION/atmosphere layer only. Rising string swell, "
               "low dissonant drone, distant metallic shimmer, airy noise texture. "
               "NO beat, NO clear melody, NO percussion. Builds quiet unease, {emo}. "
               "Seamless swelling loop. Atmospheric spy suspense."),
    },
}

# ============================================================
# 2. 11 段主题乐创意方向（情绪递进：克制→收紧→终局）
# ============================================================
# emo: 该段整体情绪词（喂给 4 stem 的 {emo}）
# instr: motif stem 用的主奏乐器
THEMES = {
    'intro':      dict(emo='suspenseful yet restrained, a cold open', instr='solo grand piano',
                       note='标题/序章：悬疑铺陈，克制中透出不安'),
    'chapter_1':  dict(emo='cold, observational, lonely',           instr='solo erhu (Chinese violin)',
                       note='第1章：克制。冷峻、观察、孤身'),
    'chapter_2':  dict(emo='tightening, watchful, low dread',        instr='solo clarinet',
                       note='第2章：收紧。暗处有人在看'),
    'chapter_3':  dict(emo='undercurrent, uneasy, slow burn',        instr='solo muted trumpet',
                       note='第3章：暗流。表面平静下的涌动'),
    'chapter_4':  dict(emo='accelerating, driven, restless',         instr='solo piano with light strings',
                       note='第4章：提速。节奏感上来'),
    'chapter_5':  dict(emo='high pressure, paranoid, claustrophobic', instr='solo violin',
                       note='第5章：高压。偏执、窒息'),
    'chapter_6':  dict(emo='critical, brink, barely contained',      instr='solo cello',
                       note='第6章：临界。弦将断'),
    'chapter_7':  dict(emo='finale, fatal, resignation and resolve',  instr='full string section lead',
                       note='第7章：终局。命运收口'),
    'outro':      dict(emo='resigned resolution, bittersweet calm',  instr='solo piano + reed',
                       note='真结局收束：余烬般的平静'),
    'victory':    dict(emo='triumphant but weary, hard-won',         instr='rising string + brass',
                       note='通关：惨胜'),
    'fail':       dict(emo='despair, loop of regret, hollow',        instr='detuned piano',
                       note='失败/重试：空洞的循环'),
}

# ============================================================
# 3. 4 段人物 motif（叠在共享章节主题之上作 route bed）
#    来源：决策 §四。calm/tense 两变体。
# ============================================================
MOTIFS = {
    'shenmo': dict(name='沈墨 SM', key='D 小调', emo_calm='decisive, grounded, "I did it"',
                   emo_tense='urgent, precise, closing in',
                   instr='low cello pizzicato + triangle cold accents',
                   note='小调下行三音 + 低音提琴拨奏 + 三角铁冷点；行动叙事'),
    'vera':   dict(name='薇拉 V', key='降 B 大调', emo_calm='warm-melancholic, reflective, "I remember"',
                   emo_tense='guarded, fractured memory',
                   instr='reed slow arpeggio + distant piano echo',
                   note='簧管慢琶音 + 远处钢琴回声（降六音暖凉）；记忆叙事'),
    'ito':    dict(name='伊藤 I', key='g 小调', emo_calm='bureaucratic stillness, "evidence exists"',
                   emo_tense='mechanical pressure, mounting file',
                   instr='typewriter/telegraph sample + long string tone + low-pass',
                   note='机械节拍(电报采样) + 弦乐长音 + 低通"档案室"感；存在叙事'),
    'cage':   dict(name='设局/笼(共享反派)', key='扭曲笼式和声(45 法则动机)',
                   emo_calm='veiled, patient, watching',
                   emo_tense='closing trap, inevitability',
                   instr='distorted cage chord (45-rule motif) on low reed + piano',
                   note='plotter/山本场景复用；反派母动机'),
}

# ============================================================
# 4. 提示词构建
# ============================================================
def build_theme_stem_prompts():
    """返回 list[dict]: {theme, stem, file, prompt, bpm, emo, note}"""
    rows = []
    for tid, t in THEMES.items():
        bpm = BPM[tid]
        for stem, spec in STEM_SPEC.items():
            prompt = spec['en'].format(emo=t['emo'], bpm=bpm, instr=t['instr'])
            fname = f"{tid}_{stem}.mp3"
            rows.append(dict(
                theme=tid, stem=stem, file=fname,
                prompt=prompt, bpm=bpm, emo=t['emo'],
                note=t['note'], kind='theme',
            ))
    return rows

def build_motif_prompts():
    rows = []
    for mid, m in MOTIFS.items():
        for variant in ('calm', 'tense'):
            emo = m[f'emo_{variant}']
            prompt = ("1941 Shanghai noir CHARACTER MOTIF, short loopable phrase, "
                      "{} (key: {}). {} Single clear identity, NO full drums, "
                      "NO busy arrangement — a recognizable 8-16 bar motif that can sit "
                      "under dialogue. Seamless loop.").format(
                          m['name'], m['key'], m['instr'] + ', ' + emo)
            fname = f"motif_{mid}_{variant}.mp3"
            rows.append(dict(
                theme=f"motif_{mid}", stem=variant, file=fname,
                prompt=prompt, bpm=BPM['intro'], emo=emo,
                note=m['note'], kind='motif',
            ))
    return rows

# ============================================================
# 5. MiniMax 实时生成客户端（仅 --live 用）
#    说明：MiniMax 音乐为异步任务，submit 拿 task_id → poll → download。
#    下列 endpoint / 字段为常见形态，请按你账号的实际文档核对
#    （尤其 group_id 与 version 字段）。失败单条不阻塞全局。
# ============================================================
def _minimax_client():
    api_key = os.environ.get('MINIMAX_API_KEY')
    group_id = os.environ.get('MINIMAX_GROUP_ID')
    if not api_key or not group_id:
        raise RuntimeError('需要环境变量 MINIMAX_API_KEY 与 MINIMAX_GROUP_ID')
    base = os.environ.get('MINIMAX_BASE', 'https://api.minimax.io/v1')
    return api_key, group_id, base

def _post_json(url, payload, api_key):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def _get_json(url, api_key):
    req = urllib.request.Request(url, method='GET')
    req.add_header('Authorization', f'Bearer {api_key}')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def generate_one_minimax(prompt, api_key, group_id, base, duration=60):
    """提交一条音乐生成任务并返回下载到的 (bytes, ext)。失败抛异常。"""
    submit_url = f"{base}/music_generation?GroupId={group_id}"
    resp = _post_json(submit_url, {"prompt": prompt, "duration": duration}, api_key)
    task_id = resp.get('task_id') or (resp.get('data') or {}).get('task_id')
    if not task_id:
        raise RuntimeError(f'MiniMax 未返回 task_id: {resp}')
    # 轮询
    for _ in range(40):  # 最多 ~200s
        time.sleep(5)
        status = _get_json(f"{base}/get_music_generation_task?task_id={task_id}&GroupId={group_id}", api_key)
        st = (status.get('data') or {}).get('status') or status.get('status')
        if st in ('SUCCESS', 'success', 'SUCCEED'):
            d = status.get('data') or {}
            audio_url = d.get('audio') or d.get('audio_url') or d.get('file_url')
            b64 = d.get('binary_data') or d.get('audio_data')
            if b64:
                import base64
                return base64.b64decode(b64), 'mp3'
            if audio_url:
                req = urllib.request.Request(audio_url)
                with urllib.request.urlopen(req, timeout=60) as r:
                    return r.read(), 'mp3'
            raise RuntimeError('任务成功但无音频数据')
        if st in ('FAILED', 'failed', 'FAIL'):
            raise RuntimeError(f'MiniMax 任务失败: {status}')
    raise RuntimeError('MiniMax 轮询超时')

# ============================================================
# 6. ACE-Step 备用（本地，无 API）
#    说明：ACE-Step 出的是混音立体声，拿不到语义 stem；故"每个 stem 单独写
#    prompt 生成一条"，引擎叠层 —— 与多 layer 架构完全对齐。
#    下列为调用占位：请把你的本地 ACE-Step 推理入口接在 acestep_generate()。
# ============================================================
def acestep_generate(prompt, out_path, duration=60, **kw):
    """
    本地 ACE-Step 1.5 生成占位。
    接法示例（请按你的部署改）:
        from acestep.pipeline import ACEStepPipeline
        pipe = ACEStepPipeline(...)
        audio = pipe(prompt=prompt, duration=duration, ...)
        audio.export(out_path)
    未接入时抛 NotImplementedError，脚本自动回落到仅写 manifest。
    """
    raise NotImplementedError('ACE-Step 本地推理未接入：请在 acestep_generate() 内接你的推理入口')

# ============================================================
# 7. 主流程
# ============================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--live', action='store_true', help='调用 MiniMax 真实生成（需 KEY+GROUP_ID）')
    ap.add_argument('--only', help='只生成某 theme 或 motif，如 chapter_3 / motif_ito')
    ap.add_argument('--dry-run', action='store_true', help='只打印提示词、不写盘')
    args = ap.parse_args()

    rows = build_theme_stem_prompts() + build_motif_prompts()
    if args.only:
        rows = [r for r in rows if r['theme'] == args.only]
        if not rows:
            print(f'[!] 未匹配到 --only={args.only}（可选: '
                  f"{', '.join(sorted(set(r['theme'] for r in build_theme_stem_prompts()+build_motif_prompts())))}）")
            sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    manifest = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'tool': 'MiniMax (primary) / ACE-Step 1.5 (backup)',
        'spec': '4-stem adaptive: bed/pulse/motif/tension per theme; 2-variant motif per character',
        'stem_spec': {k: v['en'] for k, v in STEM_SPEC.items()},
        'bpm': BPM,
        'total_targets': len(rows),
        'themes': THEMES,
        'motifs': MOTIFS,
        'targets': rows,
        'failed': [],
    }

    if args.dry_run:
        for r in rows:
            print(f"\n=== {r['file']} ===\n{r['prompt']}\n")
        print(f'\n[dry-run] 共 {len(rows)} 条提示词，未写盘。')
        return

    # 写 manifest（总是先写，保证即便 live 中断也有完整 prompt 包）
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f'[✓] prompt_manifest.json 已写出: {MANIFEST_PATH} ({len(rows)} 条)')

    if not args.live:
        print('[i] 默认仅产出提示词包（不联网）。如需真实生成，加 --live 并设置 '
              'MINIMAX_API_KEY / MINIMAX_GROUP_ID 环境变量。')
        print('[i] 也可把 manifest 中的 prompt 直接粘贴进 MiniMax 音乐网页端生成后，')
        print('    按 targets[].file 命名落盘到 assets/audio_next/bgm/。')
        return

    # ---- live 模式 ----
    print('[live] 调用 MiniMax 真实生成…')
    api_key, group_id, base = _minimax_client()
    done = 0
    for r in rows:
        out_path = os.path.join(OUT_DIR, r['file'])
        try:
            audio, ext = generate_one_minimax(r['prompt'], api_key, group_id, base)
            if ext != 'mp3':
                out_path = out_path[:-4] + '.' + ext
            with open(out_path, 'wb') as f:
                f.write(audio)
            done += 1
            print(f'  [✓] {r["file"]}')
        except Exception as e:
            manifest['failed'].append({'file': r['file'], 'error': str(e)})
            print(f'  [✗] {r["file"]} -> {e}')
    # 回写 manifest（记录失败）
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f'\n[完成] 成功 {done}/{len(rows)}；失败 {len(manifest["failed"])}（见 manifest.failed）')

if __name__ == '__main__':
    main()

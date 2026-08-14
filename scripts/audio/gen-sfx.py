#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-sfx.py — CageMaster4 程序化音效生成器（无预算 / 0 依赖外部素材）
落盘到: D:/killersudoku/cagemaster4/assets/audio_next/sfx/

生成内容:
  1. 6 类间谍时代音: coin_drop / telegraph_key / radio_static / file_cabinet / pen_ink / distant_siren
  2. 多样本变体: footstep(wood/stone/hall/run) / typewriter / door(open/light/stone/final) 各 3 变体
  3. 复用既有 sfx 见决策文档 §八（此处只补缺口 + 多样本）

全部用 numpy 合成，质感贴合"木/纸/石/机械"有机感，且随机种子即无限干净多样本。

依赖: numpy  (pip install numpy)
用法: python gen-sfx.py            # 全部
      python gen-sfx.py --only coin_drop
"""
import os
import sys
import argparse
import numpy as np

# ============ 基础工具 ============
SR = 44100

def write_wav(path: str, data: np.ndarray, sr: int = SR):
    """最小 WAV 写出（16-bit PCM），无外部依赖。"""
    import struct
    data = np.clip(data, -1.0, 1.0)
    pcm = (data * 32767.0).astype('<i2')
    with open(path, 'wb') as f:
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + len(pcm) * 2))
        f.write(b'WAVE')
        f.write(b'fmt ')
        f.write(struct.pack('<IHHIIHH', 16, 1, 1, sr, sr * 2, 2, 16))
        f.write(b'data')
        f.write(struct.pack('<I', len(pcm) * 2))
        f.write(pcm.tobytes())

def noise(n: int, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.standard_normal(n)

def env_exp(n: int, tau: float) -> np.ndarray:
    t = np.arange(n) / SR
    return np.exp(-t / tau)

def env_lin(n: int, a=0.0, b=1.0) -> np.ndarray:
    return np.linspace(a, b, n)

# ============ 单个音合成函数 ============
def coin_drop(seed: int) -> np.ndarray:
    """硬币落地: 两正弦金属泛音 + 快衰减 + 微噪声瞬态 (~250ms)"""
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    f1, f2 = 2350.0, 3150.0
    sig = (0.6 * np.sin(2*np.pi*f1*t) + 0.4 * np.sin(2*np.pi*f2*t)) * env_exp(n, 0.05)
    # 落地瞬态
    nz = noise(int(0.01*SR), seed) * env_exp(int(0.01*SR), 0.003) * 0.4
    out = np.zeros(n); out[:len(nz)] += nz; out += sig
    return out * 0.5

def telegraph_key(seed: int) -> np.ndarray:
    """电报键: 共振带通噪声爆 (~80ms)"""
    n = int(0.08 * SR)
    nz = noise(n, seed)
    # 带通 ~2kHz
    from numpy.fft import rfft, irfft, rfftfreq
    spec = rfft(nz); freqs = rfftfreq(n, 1/SR)
    band = (freqs > 1500) & (freqs < 2800)
    spec[~band] = 0; spec[band] *= 3
    out = irfft(spec) * env_exp(n, 0.012)
    return out * 0.8

def radio_static(seed: int) -> np.ndarray:
    """无线电余韵: 滤波白噪 + 偶发噼啪 (loopable 1s 段)"""
    n = SR
    out = noise(n, seed) * 0.18
    # 偶发噼啪
    rng = np.random.default_rng(seed + 7)
    for _ in range(6):
        i = int(rng.integers(0, n - 500))
        out[i:i+500] += noise(500, seed+_) * env_exp(500, 0.01) * 0.5
    return out

def file_cabinet(seed: int) -> np.ndarray:
    """档案柜抽拉: 木质共振 + 低通噪声涌 (~400ms)"""
    n = int(0.4 * SR)
    nz = noise(n, seed)
    from numpy.fft import rfft, irfft, rfftfreq
    spec = rfft(nz); freqs = rfftfreq(n, 1/SR)
    spec[freqs > 1200] = 0  # 低通
    out = irfft(spec) * env_exp(n, 0.12)
    return out * 0.7

def pen_ink(seed: int) -> np.ndarray:
    """钢笔吸墨: 低频气泡涌动 (~200ms)"""
    n = int(0.2 * SR)
    t = np.arange(n) / SR
    wob = 0.5 + 0.5 * np.sin(2*np.pi*18*t)
    out = noise(n, seed) * env_exp(n, 0.04) * wob * 0.5
    return out

def distant_siren(seed: int) -> np.ndarray:
    """孤岛夜警: 正弦扫频 + 重低通 + 慢颤音 (1.2s, loopable)"""
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    base = np.linspace(420, 620, n)  # 上行扫频
    trem = 1 + 0.15 * np.sin(2*np.pi*3*t)
    out = np.sin(2*np.pi*base*t) * trem * env_exp(n, 0.4)
    from numpy.fft import rfft, irfft, rfftfreq
    spec = rfft(out); freqs = rfftfreq(n, 1/SR)
    spec[freqs > 1500] = 0  # 重低通
    return irfft(spec) * 0.5

def footstep(kind: str, seed: int) -> np.ndarray:
    """脚步: 噪声脉冲 + 按材质滤波。kind: wood/stone/hall/run"""
    dur = 0.09 if kind != 'run' else 0.07
    n = int(dur * SR)
    n += n % 2  # 保证偶数，irfft 长度才与包络一致
    nz = noise(n, seed)
    from numpy.fft import rfft, irfft, rfftfreq
    spec = rfft(nz); freqs = rfftfreq(n, 1/SR)
    if kind == 'wood':   spec[freqs > 900] = 0
    elif kind == 'stone': spec[(freqs < 200) | (freqs > 2500)] = 0
    elif kind == 'hall':  spec[freqs > 1600] = 0
    else:                spec[freqs > 1100] = 0
    out = irfft(spec) * env_exp(n, 0.02)
    return out * 0.6

def typewriter_key(seed: int) -> np.ndarray:
    """打字机键: 短促咔嗒 (~40ms)"""
    n = int(0.04 * SR)
    nz = noise(n, seed)
    from numpy.fft import rfft, irfft, rfftfreq
    spec = rfft(nz); freqs = rfftfreq(n, 1/SR)
    spec[freqs > 3500] = 0
    out = irfft(spec) * env_exp(n, 0.006)
    return out * 0.7

def door(kind: str, seed: int) -> np.ndarray:
    """门: open(木门吱呀)/light(轻闩)/stone(石门磨)/final(巨门)"""
    dur = {'open':0.4,'light':0.25,'stone':0.6,'final':0.9}[kind]
    n = int(dur * SR)
    n += n % 2  # 保证偶数，irfft 长度才与包络一致
    nz = noise(n, seed)
    from numpy.fft import rfft, irfft, rfftfreq
    spec = rfft(nz); freqs = rfftfreq(n, 1/SR)
    if kind == 'stone':
        spec[freqs > 800] = 0
    elif kind in ('open','light'):
        spec[freqs > 1800] = 0
    else:
        spec[freqs > 1000] = 0
    out = irfft(spec) * env_exp(n, dur*0.25)
    return out * 0.7

# ============ 清单 ============
ERA_SFX = {
    'coin_drop': ('coin_drop', coin_drop, 1),
    'telegraph_key': ('telegraph_key', telegraph_key, 3),
    'radio_static': ('radio_static', radio_static, 1),
    'file_cabinet': ('file_cabinet', file_cabinet, 3),
    'pen_ink': ('pen_ink', pen_ink, 1),
    'distant_siren': ('distant_siren', distant_siren, 1),
}
MULTI_SFX = {
    'footstep_wood':  ('footstep_wood',  'wood',  footstep, 3),
    'footstep_stone': ('footstep_stone', 'stone', footstep, 3),
    'footstep_hall':  ('footstep_hall',  'hall',  footstep, 3),
    'footstep_run':   ('footstep_run',   'run',   footstep, 3),
    'typewriter':     ('typewriter',     None,    typewriter_key, 3),
    'door_open':      ('door_open',      'open',  door, 3),
    'door_open_light':('door_open_light', 'light', door, 3),
    'door_stone_open':('door_stone_open', 'stone', door, 3),
    'door_final_open':('door_final_open', 'final', door, 3),
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='只生成某事件, 如 coin_drop')
    args = ap.parse_args()

    out_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'audio_next', 'sfx')
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    targets = {}
    if args.only:
        if args.only in ERA_SFX: targets[args.only] = ERA_SFX[args.only]
        elif args.only in MULTI_SFX: targets[args.only] = MULTI_SFX[args.only]
        else:
            print(f'未知事件: {args.only}'); sys.exit(1)
    else:
        targets.update(ERA_SFX); targets.update(MULTI_SFX)

    count = 0
    for evt, spec in targets.items():
        if evt in ERA_SFX:
            name, fn, variants = spec
            for v in range(variants):
                data = fn(seed=hash((name, v)) % (2**31))
                fn_name = f'{name}.wav' if variants == 1 else f'{name}_{v+1:02d}.wav'
                write_wav(os.path.join(out_dir, fn_name), data); count += 1
                print(f'  ✓ {fn_name}')
        else:
            name, kind, fn, variants = spec
            for v in range(variants):
                seed = hash((name, v)) % (2**31)
                data = fn(seed=seed) if kind is None else fn(kind, seed=seed)
                fn_name = f'{name}_{v+1:02d}.wav'
                write_wav(os.path.join(out_dir, fn_name), data); count += 1
                print(f'  ✓ {fn_name}')
    print(f'\n完成: 共生成 {count} 个 SFX → {out_dir}')

if __name__ == '__main__':
    main()

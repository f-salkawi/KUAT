"""Original background music (synthesised here, so no samples or licences) and the narration mix for the KUAT demo.

  python audio.py music SECONDS out.wav
  python audio.py mix SECONDS lines.json music.wav mix_out.wav music_only_out.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def read_wav_mono(path):
    with wave.open(path, 'rb') as w:
        sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) / SR, np.arange(len(x)) / sr, x)
    return x


def movavg(x, w):
    c = np.cumsum(np.insert(x, 0, 0.0))
    y = (c[w:] - c[:-w]) / w
    pad = w // 2
    return np.concatenate([np.full(pad, y[0]), y, np.full(len(x) - len(y) - pad, y[-1])])


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def music(dur):
    bpm = 92.0
    beat = 60 / bpm
    bar = 4 * beat
    n = int(dur * SR)
    out = np.zeros(n + SR * 4)
    chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 64]]   # Am7 Fmaj7 Cmaj7 G6
    roots = [45, 41, 36, 43]
    nbars = int(np.ceil(dur / bar)) + 1
    last_full = int(dur / bar) - 2                                                    # last 2 bars: pad only

    def add(sig, start):
        i = int(start * SR)
        if i >= len(out):
            return
        j = min(len(out), i + len(sig))
        out[i:j] += sig[: j - i]

    # Warm pad: detuned soft partials, slow swell, crossfading into the next bar.
    for b in range(nbars):
        t = np.arange(int((bar + 1.2) * SR)) / SR
        env = np.minimum(1, t / 0.5) * np.where(t < bar, 1.0, np.maximum(0, 1 - (t - bar) / 1.2))
        sig = np.zeros_like(t)
        for m in chords[b % 4]:
            for det in (-0.0025, 0.0025):
                f = midi(m) * (1 + det)
                sig += np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
        sig *= 1 + 0.08 * np.sin(2 * np.pi * 0.25 * t)
        add(0.018 * sig * env, b * bar)

    # Bass on beats 1, 3 and the "and" of 3.
    for b in range(2, nbars):
        f = midi(roots[b % 4])
        for pos in (0, 2, 2.5):
            t = np.arange(int((0.9 if pos == 0 else 0.45) * SR)) / SR
            env = np.minimum(1, t / 0.008) * np.exp(-t / (0.35 if pos == 0 else 0.18))
            add(0.22 * (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)) * env, b * bar + pos * beat)

    # Soft plucked arpeggio from bar 4, lightly swung.
    for b in range(4, min(nbars, last_full)):
        ch = chords[b % 4]
        for k, idx in enumerate([0, 1, 2, 3, 2, 1, 2, 3]):
            f = midi(ch[idx] + 12)
            t = np.arange(int(0.6 * SR)) / SR
            env = np.minimum(1, t / 0.004) * np.exp(-t / 0.16)
            sig = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05)
            add(0.035 * sig * env, b * bar + k * beat / 2 + (0.07 * beat if k % 2 else 0))

    # Lo-fi drums.
    tk = np.arange(int(0.35 * SR)) / SR
    kick = np.sin(2 * np.pi * np.cumsum(48 + 75 * np.exp(-tk / 0.035)) / SR) * np.exp(-tk / 0.11)

    def snare():
        t = np.arange(int(0.3 * SR)) / SR
        return 0.5 * np.diff(rng.standard_normal(len(t)), prepend=0) * np.exp(-t / 0.07) + 0.6 * np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05)

    def hat():
        t = np.arange(int(0.06 * SR)) / SR
        return np.diff(rng.standard_normal(len(t)), prepend=0) * np.exp(-t / 0.015)

    for b in range(2, last_full):
        base = b * bar
        add(0.30 * kick, base)
        add(0.30 * kick, base + 2 * beat)
        if b % 4 == 3:
            add(0.18 * kick, base + 3.5 * beat)
        if b >= 4:
            add(0.06 * snare(), base + beat)
            add(0.06 * snare(), base + 3 * beat)
        for k in range(8):
            add((0.02 if k % 2 else 0.014) * hat(), base + k * beat / 2 + (0.07 * beat if k % 2 else 0))

    out = np.convolve(out[:n], np.ones(4) / 4, 'same')                                 # gentle lo-fi top end
    idx = np.arange(n)
    out *= np.minimum(1, idx / (1.5 * SR)) * np.minimum(1, (n - idx) / (3.0 * SR))
    return out / max(1e-9, np.abs(out).max()) * 0.6


def mix(dur, lines_path, music_path, out_mix, out_music):
    n = int(dur * SR)
    voice = np.zeros(n)
    for line in json.load(open(lines_path)):
        x = read_wav_mono(line['file'])
        x = x / max(1e-9, np.abs(x).max()) * 0.85
        i = int(line['t'] / 1000 * SR)
        j = min(n, i + len(x))
        if i < n:
            voice[i:j] += x[: j - i]
    m = read_wav_mono(music_path)
    m = np.concatenate([m, np.zeros(max(0, n - len(m)))])[:n]
    # Duck the music while the narrator speaks.
    active = (movavg(np.abs(voice), int(0.05 * SR)) > 0.01).astype(float)
    active = np.clip(movavg(active, int(0.35 * SR)) * 1.5, 0, 1)
    final = voice + m * (0.32 - 0.20 * active)
    final /= max(1.0, np.abs(final).max() / 0.97)
    write_wav(out_mix, final)
    write_wav(out_music, m * 0.32)
    print(f'voice peak {np.abs(voice).max():.2f}, mix peak {np.abs(final).max():.2f}, lines {len(json.load(open(lines_path)))}')


if __name__ == '__main__':
    if sys.argv[1] == 'music':
        x = music(float(sys.argv[2]))
        write_wav(sys.argv[3], x)
        print(f'music {len(x) / SR:.1f}s peak {np.abs(x).max():.2f} rms {np.sqrt((x ** 2).mean()):.3f}')
    else:
        mix(float(sys.argv[2]), *sys.argv[3:7])

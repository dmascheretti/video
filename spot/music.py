"""Procedural score + sound design for the 30s VYRA One spot. 120 BPM, A minor. Writes music.wav (48 kHz stereo).
Every cue is placed on the same timeline used by scene.js."""
import numpy as np, wave, sys

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N)
REV = np.zeros((2, N))  # reverb send bus


def midi(m): return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, gain=1.0, pan=0.0, rev=0.0):
    i = int(t * SR)
    if sig.ndim == 1:
        sig = np.vstack([sig, sig])
    n = min(sig.shape[1], N - i)
    if n <= 0: return
    gl, gr = gain * np.sqrt((1 - pan) / 2) * 1.414, gain * np.sqrt((1 + pan) / 2) * 1.414
    L[i:i + n] += sig[0, :n] * gl; R[i:i + n] += sig[1, :n] * gr
    if rev:
        REV[0, i:i + n] += sig[0, :n] * gl * rev; REV[1, i:i + n] += sig[1, :n] * gr * rev


def tt(d): return np.arange(int(d * SR)) / SR


def adsr(n, a=.005, d=.1, s=.7, r=.2, sr=SR):
    e = np.ones(n) * s
    na, nd, nr = int(a * sr), int(d * sr), int(r * sr)
    na = min(na, n); e[:na] = np.linspace(0, 1, na)
    nd = min(nd, n - na); e[na:na + nd] = np.linspace(1, s, nd)
    if nr < n: e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def stft_filter(x, gain_fn):
    """Time-varying spectral filter. gain_fn(freqs, t_center) -> gains."""
    W, H = 2048, 512
    win = np.hanning(W)
    pad = np.concatenate([np.zeros(W), x, np.zeros(W)])
    out = np.zeros_like(pad)
    f = np.fft.rfftfreq(W, 1 / SR)
    for s in range(0, len(pad) - W, H):
        X = np.fft.rfft(pad[s:s + W] * win)
        out[s:s + W] += np.fft.irfft(X * gain_fn(f, (s - W + W / 2) / SR), W) * win
    return out[W:W + len(x)] / 1.5


def bandpass_noise(d, fc_fn, q=1.2, stereo=True):
    n = int(d * SR)
    ch = []
    for c in range(2 if stereo else 1):
        x = rng.standard_normal(n)
        ch.append(stft_filter(x, lambda f, t: np.exp(-0.5 * (np.log2((f + 1) / max(fc_fn(t), 20)) * q * 2) ** 2)))
    return np.vstack(ch) if stereo else ch[0]


def saw(freq, t, cutoff=3000):
    out = np.zeros_like(t)
    k = 1
    while k * freq < min(cutoff, SR / 2 - 1000) and k < 60:
        out += np.sin(2 * np.pi * k * freq * t + k * 0.7) / k * (1.0 / (1 + (k * freq / cutoff) ** 2))
        k += 1
    return out


# ---------------- instruments ----------------
def kick(big=False):
    t = tt(0.6 if big else 0.4)
    f = 45 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * (4 if big else 7))
    s += 0.3 * np.exp(-t * 300) * rng.standard_normal(len(t))
    return np.tanh(s * 1.6)


def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    x = rng.standard_normal(len(t))
    x = x - np.convolve(x, np.ones(6) / 6, 'same')
    return x * np.exp(-t * (18 if open_ else 70)) * 0.5


def clap():
    t = tt(0.35)
    x = rng.standard_normal(len(t))
    x = x - np.convolve(x, np.ones(3) / 3, 'same')
    env = np.exp(-t * 18)
    for off in (0.0, 0.011, 0.022):
        i = int(off * SR); env[i:i + 200] += np.linspace(1, 0, 200)
    return x * env * 0.45


def boom(dur=2.5, f0=70, f1=28):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 2.2)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    s += 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * np.exp(-t * 3)
    return np.tanh(s * 1.4)


def impact_noise(dur=1.6):
    t = tt(dur)
    x = rng.standard_normal((2, len(t)))
    return x * np.exp(-t * 4) * 0.5


def glitch(dur=0.25):
    t = tt(dur)
    s = np.sign(np.sin(2 * np.pi * (2400 * np.floor(t * 60) % 3000 + 300) * t)) * 0.3
    s *= (np.floor(t * 90) % 2) * np.exp(-t * 10)
    return s


def whoosh(dur=0.9, f_from=300, f_to=4000, peak=0.6):
    def fc(t):
        p = np.clip(t / dur, 0, 1)
        return f_from * (f_to / f_from) ** p
    x = bandpass_noise(dur, fc, q=0.9)
    t = tt(dur)[:x.shape[1]]
    env = np.where(t < dur * peak, (t / (dur * peak)) ** 2, np.exp(-(t - dur * peak) * 9))
    return x * env


def riser(dur=1.5):
    t = tt(dur)
    x = bandpass_noise(dur, lambda tc: 200 * (40 ** np.clip(tc / dur, 0, 1)), q=1.4)
    p = t / dur
    tone = np.sin(2 * np.pi * np.cumsum(220 * 4 ** p) / SR) * 0.25
    env = p ** 2.2
    return (x + tone) * env


def pluck(m, d=0.6, bright=4000):
    t = tt(d)
    s = saw(midi(m), t, bright) * np.exp(-t * 6)
    s += 0.5 * np.sin(2 * np.pi * midi(m) * t) * np.exp(-t * 4)
    return s * 0.35


def bell(m, d=2.5):
    t = tt(d)
    f = midi(m)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.6)
    s += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 3)
    return s * 0.4


def blip(f=1800, d=0.12):
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 40) * 0.5


def pad_chord(notes, d, cutoff=1400):
    t = tt(d)
    out = np.zeros((2, len(t)))
    for m in notes:
        for det, ch in ((-0.09, 0), (0.09, 1), (0.0, 0), (0.0, 1)):
            out[ch] += saw(midi(m + det), t + rng.random(), cutoff)
    return out / len(notes) * 0.18


# ---------------- arrangement ----------------
# chords per bar (2s): Am - F - C - G   (i VI III VII)
CH = [[57, 60, 64, 71], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]]
BASS = [45, 41, 48, 43]

# sidechain envelope (kick ducking)
duck = np.ones(N)


def add_duck(t, depth=0.6):
    i = int(t * SR); n = int(0.28 * SR)
    seg = 1 - depth * np.exp(-np.arange(n) / SR * 14)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[:max(0, min(n, N - i))])


padbus = np.zeros((2, N))
for bar in range(15):
    t0 = bar * 2.0
    if 21.5 <= t0 < 22: continue
    c = CH[bar % 4]
    end = min(t0 + 2.0, 21.5) if t0 < 21.5 else t0 + 2.0
    d = end - t0 + 0.4
    cutoff = 900 if t0 < 9 else 1800
    if t0 >= 24: cutoff = 1200
    p = pad_chord(c, d, cutoff)
    p *= adsr(p.shape[1], a=0.3 if bar else 1.4, d=.2, s=1, r=0.4)
    i = int(t0 * SR); n = min(p.shape[1], N - i)
    padbus[:, i:i + n] += p[:, :n]

# fade pad into the 0.5s silence and the final tail
padbus[:, int(21.45 * SR):int(22 * SR)] = 0
tail = np.ones(N); a, b = int(27.5 * SR), int(29.6 * SR)
tail[a:b] = np.linspace(1, 0, b - a); tail[b:] = 0
padbus *= tail

# drums
for k in range(60):
    t = k * BEAT
    if t < 2.0 or 21.5 <= t < 22 or t >= 25.0: continue
    full = (9.0 <= t < 21.5) or (22.0 <= t < 25.0)
    on_kick = full or (k % 2 == 0)
    if on_kick:
        place(kick(big=(t == 22.0)), t, 0.9); add_duck(t)
    if full and k % 2 == 1: place(clap(), t, 0.5, 0.05, rev=0.25)
    # hats
    steps = 4 if full else 2
    for s in range(steps):
        th = t + s * BEAT / steps
        if th >= 21.5 and th < 22: continue
        place(hat(open_=(s == steps // 2 and full and k % 4 == 3)), th + 0.005, 0.22 if s % 2 else 0.12, pan=0.35 * (1 if s % 2 else -1))

# bass (8ths, from 2s; heavier from 9s)
for k in range(120):
    t = k * BEAT / 2
    if t < 2.0 or 21.5 <= t < 22 or t >= 25: continue
    bar = int(t // 2)
    m = BASS[bar % 4] - 12
    if k % 2 == 1 and t >= 9: m += 12
    tb = tt(BEAT / 2 * 0.95)
    s = np.sin(2 * np.pi * midi(m) * tb) + 0.35 * saw(midi(m), tb, 400 if t < 9 else 900)
    s *= adsr(len(tb), .004, .08, .6, .05)
    place(s * 0.32, t, 1.0)

# plucked arp from 9s (A minor arpeggio over the chords, 16ths)
for k in range(240):
    t = k * BEAT / 4
    if t < 9.0 or t >= 21.5: continue
    c = CH[int(t // 2) % 4]
    m = c[[0, 2, 1, 3, 2, 1][k % 6]] + 12
    place(pluck(m, 0.3, 2500 + 2000 * ((t - 9) / 12)), t, 0.22, pan=0.4 * np.sin(k * 0.7), rev=0.35)

# ---------------- sound design cues (synced to picture) ----------------
place(boom(2.8), 0.0, 0.9, rev=0.4)                  # opening hit
place(glitch(), 0.0, 0.25, rev=0.3)
place(whoosh(1.8, 200, 2500, 0.55), 0.1, 0.35, rev=0.3)  # rim-light sweep
place(whoosh(0.5, 400, 5000, 0.85), 1.55, 0.45)          # into the cut @2.0
place(blip(1760), 2.5, 0.25, rev=0.4); place(bell(81, 1.5), 2.5, 0.25, rev=0.5)  # brand name
place(whoosh(0.6, 300, 4000, 0.8), 4.55, 0.5)            # cut @5
place(whoosh(2.6, 900, 300, 0.25), 5.0, 0.22, rev=0.2)   # slow orbit air
place(blip(1320), 5.35, 0.18, rev=0.4)
place(whoosh(0.35, 500, 7000, 0.9), 8.7, 0.6)            # halo ring wipe
place(boom(1.6, 90, 35), 9.0, 0.7, rev=0.4); place(impact_noise(1.0), 9.0, 0.25, rev=0.5)
for i in range(14):                                       # counter ticks 0 -> 200MP
    tc = 9.55 + 1.2 * (1 - (1 - i / 14) ** 3)
    place(blip(2200 + i * 60, 0.03), tc, 0.12, pan=0.2)
place(riser(1.3), 11.65, 0.5, rev=0.2)                    # crash-zoom into lens
place(whoosh(1.25, 200, 9000, 0.95), 11.7, 0.45)
place(boom(2.0, 80, 30), 13.0, 0.6, rev=0.3)              # hero rotation
place(whoosh(2.5, 250, 2200, 0.5), 13.0, 0.5, rev=0.25)
for j, m in enumerate([76, 81, 83, 88]):                  # screen power-on shimmer
    place(bell(m, 1.8), 14.6 + j * 0.06, 0.15, pan=-0.3 + j * 0.2, rev=0.6)
place(blip(1500), 15.0, 0.2); place(blip(1800), 15.25, 0.18)
place(whoosh(0.5, 400, 5000, 0.85), 16.55, 0.45)          # cut @17
place(boom(1.2, 80, 40), 17.0, 0.45)
t = tt(1.3); place(np.sin(2 * np.pi * np.cumsum(400 + 900 * np.clip(t / 1.3, 0, 1)) / SR) * 0.12 * np.exp(-t * 0.6) * (t < 1.3), 18.1, 0.5, rev=0.3)  # battery fill
for k, tc in enumerate([20.0, 20.5, 21.0]):              # colorway cuts
    place(boom(0.8, 120 - k * 10, 50), tc, 0.5); place(impact_noise(0.4), tc, 0.25); place(blip(900 + k * 300, 0.08), tc, 0.25, rev=0.4)
place(riser(1.5), 20.0, 0.75)                             # riser into silence
# 21.5 - 22.0: silence
place(boom(3.0, 75, 26), 22.0, 1.1, rev=0.35)             # IMPACT + sub-drop
place(impact_noise(2.2), 22.0, 0.45, rev=0.6)
braam_t = tt(2.6)
braam = sum(saw(midi(m), braam_t + 0.1 * i, 1100) for i, m in enumerate([33, 45, 52, 57])) * np.exp(-braam_t * 1.1) * 0.22
place(braam, 22.0, 1.0, rev=0.5)
place(whoosh(0.5, 300, 5000, 0.85), 24.55, 0.4)          # cut to end card
# sonic logo: three-note motif "VY-RA-ONE" (E5 - A5 - C#6, resolves to A major)
for m, tc, g in [(76, 25.3, .5), (81, 25.55, .5), (85, 25.8, .6)]:
    place(bell(m, 3.5), tc, g, rev=0.7); place(pluck(m - 12, 1.0, 2000), tc, 0.25, rev=0.4)
pc = pad_chord([57, 61, 64, 69], 4.2, 1500) * adsr(int(4.2 * SR), .6, .3, 1, 2.2)
place(pc, 25.3, 1.2, rev=0.4)
place(boom(3.5, 60, 30), 25.3, 0.35)

# ---------------- mix ----------------
mix = np.vstack([L, R]) + padbus * 1.0
mix[:, :] *= np.minimum(1, np.vstack([duck, duck]) * 0 + 1)  # drums unaffected
mix += padbus * (duck - 1)  # sidechain pumping on pad only

# reverb: stereo exponential-decay noise IR (2.4s) via FFT convolution
ir_t = tt(2.4)
ir = rng.standard_normal((2, len(ir_t))) * np.exp(-ir_t * 2.6)
ir[:, :int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
REV += padbus * 0.25
nfft = 1 << int(np.ceil(np.log2(N + len(ir_t))))
for c in range(2):
    wet = np.fft.irfft(np.fft.rfft(REV[c], nfft) * np.fft.rfft(ir[c], nfft), nfft)[:N]
    mix[c] += wet * 0.55

# enforce the 0.5s silence before the drop and a clean end
s0, s1 = int(21.5 * SR), int(22.0 * SR)
mix[:, s0:s1] *= np.linspace(1, 0, s1 - s0) ** 8
end = int(29.7 * SR); mix[:, end:] = 0
mix[:, int(29.2 * SR):end] *= np.linspace(1, 0, end - int(29.2 * SR))

mix = np.tanh(mix / np.max(np.abs(mix)) * 1.4) * 0.89
out = (mix.T * 32767).astype(np.int16)
fn = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(fn, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', fn)

#!/usr/bin/env python3
"""
modal_render.py — 0-base modal synthesis renderer for Rhodes electric piano.

2-layer model:
  Layer 1: Modal synthesis (beam modes × natural decay)
  Layer 2: Attack impulse noise (broadband × convergence function, 10-14ms)
  Both layers merge before PU → PU nonlinearity acts on both

Design principle:
  "Physics is always correct. But which physics to adopt is determined by observation."
  Start minimal. Add only what changes the sound. Each level = one ear test.

Usage:
  python3 tools/modal_render.py                           # C4, level 2
  python3 tools/modal_render.py --level 0                 # L0: single sine
  python3 tools/modal_render.py --midi 36 48 60 72 84 96  # C2-C7
  python3 tools/modal_render.py --chromatic                # Same as above
  python3 tools/modal_render.py --all-levels               # L0-L4 comparison

Levels:
  L0: Single sine + exp decay (baseline)
  L1: 8+ beam modes (FEM freq ratios) + σ₀ decay (inharmonicity)
  L2: + PU EMF nonlinearity (e-piano character)
  L3: + Hammer spectrum via Hertz Tc (attack quality)
  L4: + Attack noise layer (metallic "click", 10-14ms convergence)

Physics sources:
  Falaize 2017: PU EMF eq.25-27 (TB excluded — minimal model reference)
  Sonderboe 2024: E-B beam, hammer zones (Table 3.2)
  Münster 2014: Tine → sine wave in 10-14ms
  Gabrielli 2020: Beam mode ratios (F1: 7.11x, 20.25x), PU H2=-12dB
  Shear 2011: Tine lengths 18-157mm, Q 731-2175
"""

import sys
import os
import argparse
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

# Add tools dir for imports
sys.path.insert(0, os.path.dirname(__file__))
from compute_tapered_modes import (
    tine_length_mm, solve_bare_beam, band_excitation,
    striking_line_mm, hammer_tip_width_mm, N_MODES,
)
from fdtd_render import (
    compute_pu_lut, lut_lookup_vec, coupling_hpf,
    per_key_gap_mm, per_key_lver_offset, PU_EMF_SCALE,
)
from fdtd_tine_simulator import get_q_value

FS = 44100

# Peak displacement in PU normalized coords (÷25mm) at velocity=1.0.
# FDTD reference: A4 forte ≈ 0.12 (3mm). Scale with velocity.
DISP_PEAK_FORTE = 0.10


# =============================================================================
# Per-key modal parameters
# =============================================================================

def get_mode_params(midi):
    """Compute per-key modal parameters from FEM.

    Returns dict with: f0, mode_freqs, shapes_at_strike, Q, L_mm
    """
    f0 = 440.0 * 2 ** ((midi - 69) / 12.0)
    L_mm = tine_length_mm(midi)
    L = L_mm / 1000.0

    freqs_bare, modes = solve_bare_beam(L)

    # Frequencies: target f0 + bare beam RATIOS for higher modes
    mode_freqs = np.zeros(N_MODES)
    mode_freqs[0] = f0
    if freqs_bare[0] > 0:
        for m in range(1, N_MODES):
            mode_freqs[m] = f0 * (freqs_bare[m] / freqs_bare[0])

    # Mode shapes at striking position (cosine-weighted band excitation)
    xs_mm = striking_line_mm(midi)
    tw_mm = hammer_tip_width_mm(midi)
    shapes = np.array([
        band_excitation(modes, L, xs_mm, tw_mm, m) for m in range(N_MODES)
    ])

    return {
        'f0': f0,
        'mode_freqs': mode_freqs,
        'shapes_at_strike': shapes,
        'Q': get_q_value(midi),
        'L_mm': L_mm,
    }


# =============================================================================
# Hammer spectrum (L3+)
# =============================================================================

def hammer_contact_time(midi, velocity):
    """Hertz contact time Tc (seconds).

    Per-zone from Sonderboe 2024 Table 3.2 (Shore A hardness).
    Velocity scaling: Tc ∝ v^(-1/5) (Hertz theory).
    """
    key = midi - 20
    # Base Tc per hardness zone (ms) — softer = longer contact
    if key <= 30:
        Tc_base = 7.0e-3    # Zone 1: Shore 30
    elif key <= 40:
        Tc_base = 6.0e-3    # Zone 2: Shore 50
    elif key <= 50:
        Tc_base = 5.0e-3    # Zone 3: Shore 70
    elif key <= 64:
        Tc_base = 4.0e-3    # Zone 4: Shore 90
    else:
        Tc_base = 3.0e-3    # Zone 5: wrapped (hardest)

    # Hertz: Tc ∝ v^(-1/5)
    v_ref = 0.8
    return Tc_base * (v_ref / max(velocity, 0.05)) ** 0.2


def apply_hammer_spectrum(A, mode_freqs, Tc):
    """Apply half-sine hammer spectrum to modal amplitudes.

    Hertz contact → half-sine force pulse → sinc spectral envelope.
    """
    A_out = A.copy()
    for m in range(len(A)):
        if mode_freqs[m] > 0:
            x = mode_freqs[m] * Tc
            # sinc envelope of half-sine pulse
            A_out[m] *= abs(np.sinc(x))  # np.sinc includes π
    return A_out


# =============================================================================
# Attack noise layer (L4+)
# =============================================================================

def attack_noise(n_samples, midi, velocity):
    """Layer 2: Attack impulse propagation as noise × convergence function.

    Physical basis: hammer impact creates broadband travelling wave in tine.
    Münster 2014: tine becomes sine wave in 10-14ms → noise vanishes by then.

    Returns noise signal (same length as tone, near-zero after ~14ms).
    """
    # Convergence function: exp decay with ~3ms time constant
    attack_dur_s = 0.012   # 12ms (Münster: 10-14ms)
    tau_attack = attack_dur_s / 4.0  # ~3ms

    t = np.arange(n_samples) / FS
    envelope = np.exp(-t / tau_attack)
    # Hard cutoff at 20ms to ensure zero contribution to sustain
    cutoff = int(0.020 * FS)
    if cutoff < n_samples:
        envelope[cutoff:] = 0.0

    # Broadband noise (all frequencies, filtered by PU later)
    rng = np.random.default_rng(seed=midi * 1000 + int(velocity * 100))
    noise = rng.standard_normal(n_samples)

    # Scale: attack noise peaks at ~20% of tone peak, velocity-dependent
    scale = 0.20 * velocity
    return noise * envelope * scale


# =============================================================================
# Core render
# =============================================================================

def render_modal(midi, velocity=0.8, duration_s=3.0, level=2):
    """Render one key using modal synthesis.

    Returns (signal, metadata).
    """
    p = get_mode_params(midi)
    f0 = p['f0']
    mode_freqs = p['mode_freqs']
    shapes = p['shapes_at_strike']
    Q = p['Q']

    n_samples = int(duration_s * FS)
    t = np.arange(n_samples) / FS

    # Displacement scale (PU normalized coords, velocity-dependent)
    disp_scale = DISP_PEAK_FORTE * velocity

    # =====================================================================
    # Layer 1: Modal synthesis
    # =====================================================================

    if level == 0:
        # L0: Single sine + exp decay
        tau = Q / (np.pi * f0)
        disp = np.sin(2 * np.pi * f0 * t) * np.exp(-t / tau) * disp_scale
    else:
        # L1+: Multiple beam modes
        # Initial amplitudes from mode shapes at strike position
        A = np.zeros(N_MODES)
        fund_shape = abs(shapes[0])
        if fund_shape < 1e-10:
            fund_shape = 1.0
        A[0] = 1.0
        for m in range(1, N_MODES):
            if mode_freqs[m] >= FS / 2:
                continue
            A[m] = shapes[m] / fund_shape

        # L3+: Hammer spectrum shapes initial amplitudes
        if level >= 3:
            Tc = hammer_contact_time(midi, velocity)
            A = apply_hammer_spectrum(A, mode_freqs, Tc)

        # Energy normalization: Σ A_n² = 1
        norm = np.sqrt(np.sum(A ** 2))
        if norm > 0:
            A /= norm

        # Decay: σ₀ only (frequency-independent, from Q)
        # All modes decay at the same rate. If ear says beam modes persist
        # too long → add frequency-dependent term later.
        tau_0 = Q / (np.pi * f0)

        # Synthesize displacement
        disp = np.zeros(n_samples)
        for m in range(N_MODES):
            if abs(A[m]) < 1e-10 or mode_freqs[m] <= 0 or mode_freqs[m] >= FS / 2:
                continue
            disp += A[m] * np.exp(-t / tau_0) * np.sin(2 * np.pi * mode_freqs[m] * t)

        disp *= disp_scale

    # =====================================================================
    # Layer 2: Attack noise (L4+)
    # =====================================================================

    if level >= 4:
        noise = attack_noise(n_samples, midi, velocity)
        # Scale noise to displacement range and add
        disp = disp + noise * disp_scale

    # =====================================================================
    # PU EMF (L2+)
    # =====================================================================

    if level >= 2:
        gap = per_key_gap_mm(midi)
        lver = per_key_lver_offset(midi)
        lut, pu_params = compute_pu_lut(
            symmetry=0.0, distance=0.0,
            gap_mm=gap, q_range=1.0, lver_offset=lver,
        )

        # Velocity: numerical central difference
        vel_signal = np.zeros(n_samples)
        vel_signal[1:-1] = (disp[2:] - disp[:-2]) * (FS / 2)
        vel_signal[0] = (disp[1] - disp[0]) * FS
        vel_signal[-1] = (disp[-1] - disp[-2]) * FS

        # EMF = g'(q) × dq/dt × scale
        g_prime = lut_lookup_vec(lut, disp)
        emf = g_prime * vel_signal * PU_EMF_SCALE

        output = coupling_hpf(emf, FS)
    else:
        output = disp

    # Normalize to [-0.9, 0.9]
    peak = np.max(np.abs(output))
    if peak > 1e-12:
        output = output / peak * 0.9

    metadata = {
        'midi': midi, 'velocity': velocity, 'level': level,
        'f0': f0, 'Q': Q, 'L_mm': p['L_mm'],
        'n_modes_active': sum(1 for m in range(N_MODES)
                              if mode_freqs[m] > 0 and mode_freqs[m] < FS / 2),
        'max_disp_pu': float(np.max(np.abs(disp))),
    }
    return output, metadata


# =============================================================================
# WAV output
# =============================================================================

def write_wav(signal, filepath, fs=FS):
    """Write to 16-bit WAV."""
    s16 = np.clip(signal * 32767, -32768, 32767).astype(np.int16)
    wavfile.write(filepath, fs, s16)
    return filepath


def note_name(midi):
    names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return f"{names[midi % 12]}{midi // 12 - 1}"


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='0-base modal synthesis Rhodes renderer')
    parser.add_argument('--midi', nargs='+', type=int, default=[60],
                        help='MIDI note numbers (default: 60 = C4)')
    parser.add_argument('--vel', nargs='+', type=float, default=[0.8],
                        help='Velocity 0.0-1.0 (default: 0.8)')
    parser.add_argument('--level', type=int, default=2,
                        help='Synthesis level 0-4 (default: 2)')
    parser.add_argument('--duration', type=float, default=3.0,
                        help='Duration in seconds (default: 3.0)')
    parser.add_argument('--chromatic', action='store_true',
                        help='Render C2-C7 (MIDI 36,48,60,72,84,96)')
    parser.add_argument('--all-levels', action='store_true',
                        help='Render levels 0-4 for comparison')
    parser.add_argument('--outdir', default=None,
                        help='Output directory')
    args = parser.parse_args()

    if args.chromatic:
        args.midi = [36, 48, 60, 72, 84, 96]

    outdir = args.outdir or os.path.join(os.path.dirname(__file__), 'modal_output')
    os.makedirs(outdir, exist_ok=True)

    levels = list(range(5)) if args.all_levels else [args.level]

    print(f"Modal Render — 0-base Rhodes synthesis")
    print(f"Output: {outdir}/\n")

    for level in levels:
        for midi in args.midi:
            for vel in args.vel:
                nn = note_name(midi)
                fname = f"{nn}_L{level}_v{vel:.1f}.wav"
                fpath = os.path.join(outdir, fname)

                signal, meta = render_modal(midi, vel, args.duration, level)
                write_wav(signal, fpath)

                print(f"  {nn:4s} L{level} v={vel:.1f}  "
                      f"f0={meta['f0']:7.1f}Hz  Q={meta['Q']:4.0f}  "
                      f"modes={meta['n_modes_active']}  "
                      f"disp={meta['max_disp_pu']:.4f}  "
                      f"→ {fname}")

    # Combined chromatic WAV (if multiple notes)
    if len(args.midi) > 1 and len(levels) == 1:
        silence = np.zeros(int(0.5 * FS))
        combined = []
        for midi in args.midi:
            sig, _ = render_modal(midi, args.vel[0], args.duration, levels[0])
            combined.append(sig)
            combined.append(silence)
        combined_sig = np.concatenate(combined)
        combo_path = os.path.join(outdir, f"chromatic_L{levels[0]}_v{args.vel[0]:.1f}.wav")
        write_wav(combined_sig, combo_path)
        print(f"\n  Combined: {combo_path}")

    print("\nDone.")


if __name__ == '__main__':
    main()

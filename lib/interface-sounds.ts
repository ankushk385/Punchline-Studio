import { createAudioPlayer } from 'expo-audio';

// A very short, low-volume generated WAV keeps interface feedback offline and
// avoids shipping separate media files for a 55 ms cue.
const TAP_WAV = 'data:audio/wav;base64,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';

let enabled = true;

export function setInterfaceSoundsEnabled(next: boolean) { enabled = next; }

export function playInterfaceSound(kind: 'tap' | 'success' | 'warning' = 'tap') {
  if (!enabled) return;
  try {
    const player = createAudioPlayer(TAP_WAV);
    player.volume = kind === 'tap' ? 0.18 : 0.25;
    player.setPlaybackRate(kind === 'success' ? 1.35 : kind === 'warning' ? 0.72 : 1);
    player.play();
    setTimeout(() => player.remove(), 450);
  } catch {
    // Sound feedback must never block the interaction it accompanies.
  }
}

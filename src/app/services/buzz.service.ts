import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

const COOLDOWN_MS = 30_000;
const DEFAULT_BUZZ_URL  = 'assets/windows-live-messenger-2009-wizz.mp3';
const NOTIFICATION_URL  = 'assets/msn-sound-audiotrimmer.mp3';

export interface BuzzEvent { from: string; name: string; }

@Injectable({ providedIn: 'root' })
export class BuzzService {

  private audioCtx: AudioContext | null = null;
  private cooldowns = new Map<string, number>();

  private buzzSubject = new Subject<BuzzEvent>();
  readonly buzz$ = this.buzzSubject.asObservable();

  activeChatContactId = '';
  activeGroupId = '';

  emit(from: string, name: string): void {
    this.buzzSubject.next({ from, name });
  }

  // ── Settings ───────────────────────────────────────────

  isEnabled(): boolean {
    return localStorage.getItem('buzzEnabled') !== 'false';
  }

  setEnabled(val: boolean): void {
    localStorage.setItem('buzzEnabled', String(val));
  }

  // ── Anti-spam cooldown ────────────────────────────────

  canBuzz(contactId: string): boolean {
    return Date.now() - (this.cooldowns.get(contactId) ?? 0) >= COOLDOWN_MS;
  }

  cooldownRemaining(contactId: string): number {
    return Math.max(0, COOLDOWN_MS - (Date.now() - (this.cooldowns.get(contactId) ?? 0)));
  }

  recordBuzz(contactId: string): void {
    this.cooldowns.set(contactId, Date.now());
  }

  // ── Custom sound ──────────────────────────────────────

  get hasCustomSound(): boolean {
    return !!localStorage.getItem('buzzCustomUrl');
  }

  get customSoundName(): string {
    return localStorage.getItem('buzzCustomName') ?? '';
  }

  setCustomSound(dataUrl: string | null, name?: string): void {
    if (dataUrl) {
      localStorage.setItem('buzzCustomUrl', dataUrl);
      localStorage.setItem('buzzCustomName', name ?? '');
    } else {
      localStorage.removeItem('buzzCustomUrl');
      localStorage.removeItem('buzzCustomName');
    }
  }

  // ── Playback ──────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.isEnabled()) return;

    const url = localStorage.getItem('buzzCustomUrl') || DEFAULT_BUZZ_URL;
    try {
      const audio = new Audio(url);
      audio.volume = 0.8;
      await audio.play();
    } catch {
      this.synthesize();
    }
  }

  async playNotification(): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const audio = new Audio(NOTIFICATION_URL);
      audio.volume = 0.6;
      await audio.play();
    } catch {}
  }

  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)() as AudioContext;
    }
    return this.audioCtx as AudioContext;
  }

  private synthesize(): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    const thump     = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(190, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.10);
    thumpGain.gain.setValueAtTime(1.0, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.13);

    const buzz     = ctx.createOscillator();
    const buzzGain = ctx.createGain();
    const lfo      = ctx.createOscillator();
    const lfoGain  = ctx.createGain();

    buzz.type = 'sawtooth';
    buzz.frequency.setValueAtTime(92, now + 0.05);
    buzz.frequency.linearRampToValueAtTime(62, now + 0.52);

    lfo.type = 'square';
    lfo.frequency.setValueAtTime(26, now + 0.05);
    lfoGain.gain.setValueAtTime(0.35, now + 0.05);

    buzzGain.gain.setValueAtTime(0, now);
    buzzGain.gain.linearRampToValueAtTime(0.52, now + 0.09);
    buzzGain.gain.setValueAtTime(0.52, now + 0.34);
    buzzGain.gain.linearRampToValueAtTime(0, now + 0.56);

    lfo.connect(lfoGain);
    lfoGain.connect(buzzGain.gain);
    buzz.connect(buzzGain);
    buzzGain.connect(ctx.destination);

    lfo.start(now + 0.05);
    lfo.stop(now + 0.58);
    buzz.start(now + 0.05);
    buzz.stop(now + 0.58);
  }
}

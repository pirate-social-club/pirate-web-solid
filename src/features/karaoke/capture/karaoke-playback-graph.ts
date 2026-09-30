/** Playback owns this context; individual takes borrow it and release only their mic graph. */
export class KaraokePlaybackGraph {
  private element: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  attach(element: HTMLAudioElement | null): void {
    if (element === this.element) return;
    this.dispose();
    this.element = element;
  }

  acquire(): AudioContext {
    if (!this.element) throw new Error("Karaoke playback is unavailable");
    if (this.context) return this.context;
    const context = this.createContext();
    try {
      const source = context.createMediaElementSource(this.element);
      source.connect(context.destination);
      this.source = source;
      this.context = context;
      return context;
    } catch (error) {
      void context.close();
      throw error;
    }
  }

  dispose(): void {
    this.source?.disconnect();
    if (this.context) void this.context.close();
    this.source = null;
    this.context = null;
    this.element = null;
  }
}

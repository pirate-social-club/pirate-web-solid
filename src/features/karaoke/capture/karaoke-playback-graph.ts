/** Playback owns this context; individual takes borrow it and release only their mic graph. */
export class KaraokePlaybackGraph {
  private element: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private hasRun = false;
  private readonly pendingResumes = new Set<() => void>();
  private readonly onStateChange = () => this.checkState();

  constructor(
    private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly onInterrupted?: (songMs: number, state: AudioContextState) => void,
  ) {}

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
      context.addEventListener("statechange", this.onStateChange);
      this.checkState();
      return context;
    } catch (error) {
      void context.close();
      throw error;
    }
  }

  /** Also sampled by the playback clock in case a browser omits the event. */
  checkState(): void {
    if (this.context?.state === "running") {
      this.hasRun = true;
      return;
    }
    if (!this.context || !this.hasRun || !this.element || this.element.paused) return;
    const songMs = this.element.currentTime * 1000;
    this.element.pause();
    this.onInterrupted?.(songMs, this.context.state);
  }

  isRunning(): boolean { return this.context?.state === "running"; }

  /** Called directly by the recovery button, before yielding user activation. */
  resume(): Promise<boolean> {
    const context = this.context;
    if (!context || context.state === "closed") return Promise.resolve(false);
    if (context.state === "running") return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (running: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingResumes.delete(cancel);
        resolve(running && this.context === context);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(cancel, 2000);
      this.pendingResumes.add(cancel);
      try {
        void context.resume().then(() => finish(context.state === "running"), cancel);
      } catch { cancel(); }
    });
  }

  dispose(): void {
    this.context?.removeEventListener("statechange", this.onStateChange);
    this.pendingResumes.forEach(cancel => cancel());
    this.source?.disconnect();
    if (this.context) void this.context.close();
    this.source = null;
    this.context = null;
    this.element = null;
    this.hasRun = false;
  }
}

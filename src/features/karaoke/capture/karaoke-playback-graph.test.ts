import { expect, test } from "vitest";
import { KaraokePlaybackGraph } from "./karaoke-playback-graph";

test("repeat takes borrow one media source and route exit releases its output", () => {
  let created = 0, connected = 0, disconnected = 0, closed = 0;
  const context = { destination: {}, createMediaElementSource: () => {
    created += 1;
    return { connect: () => connected += 1, disconnect: () => disconnected += 1 };
  }, close: async () => { closed += 1; } } as unknown as AudioContext;
  const graph = new KaraokePlaybackGraph(() => context);
  const element = {} as HTMLAudioElement;
  graph.attach(element);
  expect(graph.acquire()).toBe(context);
  graph.attach(element);
  expect(graph.acquire()).toBe(context);
  expect(created).toBe(1);
  expect(connected).toBe(1);
  graph.attach(null);
  graph.dispose();
  expect(disconnected).toBe(1);
  expect(closed).toBe(1);
  expect(() => graph.acquire()).toThrow("playback is unavailable");
});

test("a failed media source releases the context and never silently falls back", () => {
  let closed = 0;
  const graph = new KaraokePlaybackGraph(() => ({ createMediaElementSource: () => { throw Error("cross-origin source"); }, close: async () => { closed += 1; } }) as unknown as AudioContext);
  graph.attach({} as HTMLAudioElement);
  expect(() => graph.acquire()).toThrow("cross-origin source");
  expect(closed).toBe(1);
});

import { afterEach, describe, expect, test, vi } from "vitest";
import {prepareBufferedGuide, GUIDE_DOWNLOAD_TIMEOUT_MS} from "./buffered-guide";
import type {readSongPlaybackAccess} from "../song-player/song-player-api";

const grant = (url: string): Awaited<ReturnType<typeof readSongPlaybackAccess>> => ({
  kind: "full_mix", playback_url: url, expires_at: Math.floor(Date.now()/1000)+900,
  renew_after: Math.floor(Date.now()/1000)+840,
});
function fixture(response: Response) {
  const readGrant=vi.fn(async () => grant("https://audio.example/fresh.mp3"));
  const fetchImpl=vi.fn<typeof fetch>(Object.assign(async () => response, {preconnect: () => {}}));
  const blobs: Blob[]=[];
  const createObjectURL=vi.fn((blob: Blob)=>{blobs.push(blob);return "blob:https://example.test/guide";});
  const revokeObjectURL=vi.fn();
  return {readGrant,fetchImpl,blobs,createObjectURL,revokeObjectURL,
    deps:{readGrant,fetch:fetchImpl,createObjectURL,revokeObjectURL,maxBytes:8}};
}
afterEach(()=>vi.useRealTimers());
describe("complete local guide preparation",()=>{
  test("mints a new grant for every take and plays the complete exact bytes",async()=>{
    const f=fixture(new Response(new Uint8Array([1,2,3]),{headers:{"content-length":"3","content-type":"audio/mpeg"}}));
    f.fetchImpl.mockImplementation(async()=>new Response(new Uint8Array([1,2,3]),{headers:{"content-length":"3","content-type":"audio/mpeg"}}));
    f.readGrant.mockResolvedValueOnce(grant("https://audio.example/first.mp3")).mockResolvedValueOnce(grant("https://audio.example/second.mp3"));
    const signal=new AbortController().signal;
    const first=await prepareBufferedGuide("song",signal,f.deps);
    const second=await prepareBufferedGuide("song",signal,f.deps);
    expect(f.readGrant).toHaveBeenCalledTimes(2);
    expect(String(f.fetchImpl.mock.calls[0]?.[0])).toBe("https://audio.example/first.mp3");
    expect(String(f.fetchImpl.mock.calls[1]?.[0])).toBe("https://audio.example/second.mp3");
    expect(f.fetchImpl.mock.calls[0]?.[1]).toMatchObject({credentials:"omit",redirect:"error"});
    expect([...new Uint8Array(await f.blobs[0]!.arrayBuffer())]).toEqual([1,2,3]);
    expect(f.blobs[0]!.type).toBe("audio/mpeg");
    first.release();first.release();second.release();expect(f.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  test("does not expose a local URL until the complete stream arrives",async()=>{
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const f=fixture(new Response(new ReadableStream({start(c){stream=c;}})));
    const pending=prepareBufferedGuide("song",new AbortController().signal,f.deps);
    await vi.waitFor(()=>expect(f.fetchImpl).toHaveBeenCalled());
    stream.enqueue(new Uint8Array([1,2]));await Promise.resolve();
    expect(f.createObjectURL).not.toHaveBeenCalled();
    stream.enqueue(new Uint8Array([3]));stream.close();
    const prepared=await pending;expect(f.blobs[0]!.size).toBe(3);prepared.release();
  });
  test.each([['short',new Uint8Array([1]),'3'],['long',new Uint8Array([1,2,3]),'2'],['oversize',new Uint8Array(9),null],['empty',new Uint8Array(),null]])("refuses %s bodies",async(_label,bytes,length)=>{
    const f=fixture(new Response(bytes,{headers:length===null?{}:{'content-length':length}}));
    await expect(prepareBufferedGuide('song',new AbortController().signal,f.deps)).rejects.toThrow();
    expect(f.createObjectURL).not.toHaveBeenCalled();
  });
  test("refuses oversized headers without reading the body",async()=>{
    const cancel=vi.fn();const f=fixture(new Response(new ReadableStream({cancel}),{headers:{'content-length':'9'}}));
    await expect(prepareBufferedGuide('song',new AbortController().signal,f.deps)).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();expect(f.createObjectURL).not.toHaveBeenCalled();
  });
  test("selection cancellation interrupts a stalled body and creates no Blob URL",async()=>{
    const cancel=vi.fn();const f=fixture(new Response(new ReadableStream({cancel})));
    const controller=new AbortController();const pending=prepareBufferedGuide('song',controller.signal,f.deps);
    const rejected=expect(pending).rejects.toThrow();
    await vi.waitFor(()=>expect(f.fetchImpl).toHaveBeenCalled());controller.abort();await rejected;
    expect(cancel).toHaveBeenCalled();expect(f.createObjectURL).not.toHaveBeenCalled();
  });
  test("a stalled download ends at the bounded deadline",async()=>{
    vi.useFakeTimers();const cancel=vi.fn();const f=fixture(new Response(new ReadableStream({cancel})));
    const pending=prepareBufferedGuide('song',new AbortController().signal,f.deps);
    const rejected=expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(GUIDE_DOWNLOAD_TIMEOUT_MS);await rejected;
    expect(cancel).toHaveBeenCalled();expect(f.createObjectURL).not.toHaveBeenCalled();
  });
  test("fetch failure and refused grants never create playback URLs",async()=>{
    const f=fixture(new Response('body'));f.fetchImpl.mockRejectedValue(new TypeError('private request detail'));
    await expect(prepareBufferedGuide('song',new AbortController().signal,f.deps)).rejects.toThrow();
    f.readGrant.mockResolvedValue(grant('http://audio.example/stale.mp3'));
    await expect(prepareBufferedGuide('song',new AbortController().signal,f.deps)).rejects.toThrow('Guide grant refused');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);expect(f.createObjectURL).not.toHaveBeenCalled();
  });
});

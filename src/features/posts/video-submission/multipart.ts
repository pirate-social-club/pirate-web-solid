import { VideoContractError, videoPartEtag, type VideoPartReceipt, type VideoReservation } from "./contracts";

type Part = VideoReservation["upload"]["parts"][number];
export class VideoUploadExpiredError extends Error {
  constructor() { super("This video upload reservation expired; resolve it before starting a new attempt"); this.name = "VideoUploadExpiredError"; }
}

/** Each acknowledged part is durably saved before another PUT starts. */
export async function uploadVideoParts(input: {
  readonly reservation: VideoReservation;
  readonly file: Blob;
  readonly receipts: readonly VideoPartReceipt[];
  readonly saveReceipt: (receipt: VideoPartReceipt) => Promise<void>;
  readonly renew: (partNumbers: readonly number[]) => Promise<readonly Part[]>;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly onProgress?: (acknowledged: number, total: number) => void;
}): Promise<readonly VideoPartReceipt[]> {
  const upload = input.reservation.upload;
  const now = input.now ?? Date.now;
  const fetchImpl = input.fetchImpl ?? fetch;
  const total = input.file.size;
  if (!Number.isSafeInteger(upload.part_size_bytes) || upload.part_size_bytes <= 0
    || upload.part_count !== Math.ceil(total / upload.part_size_bytes)
    || upload.parts.length !== upload.part_count || total < 1) {
    throw new VideoContractError("Server upload plan does not match the sealed local file");
  }
  const parts = new Map(upload.parts.map(part => [part.part_number, part]));
  if (parts.size !== upload.part_count
    || Array.from({ length: upload.part_count }, (_, i) => i + 1).some(number => !parts.has(number))) {
    throw new VideoContractError("Server upload plan has missing or duplicate parts");
  }
  const receipts = new Map<number, VideoPartReceipt>();
  for (const receipt of input.receipts) {
    if (!parts.has(receipt.part_number) || receipts.has(receipt.part_number)) {
      throw new VideoContractError("Retained upload receipts do not match this reservation");
    }
    receipts.set(receipt.part_number, { ...receipt, etag: videoPartEtag(receipt.etag) });
  }
  const partSize = (number: number) => Math.min(upload.part_size_bytes, total - (number - 1) * upload.part_size_bytes);
  const progress = () => input.onProgress?.([...receipts.keys()].reduce((sum, number) => sum + partSize(number), 0), total);
  progress();
  for (let number = 1; number <= upload.part_count; number++) {
    input.signal?.throwIfAborted();
    if (receipts.has(number)) continue;
    if (!Number.isFinite(Date.parse(upload.expires_at)) || now() >= Date.parse(upload.expires_at)) throw new VideoUploadExpiredError();
    let part = parts.get(number)!;
    if (!Number.isFinite(Date.parse(part.expires_at)) || now() >= Date.parse(part.expires_at)) {
      const renewed = await input.renew([number]);
      if (renewed.length !== 1 || renewed[0]?.part_number !== number) throw new VideoContractError("Renewal returned a different part");
      part = renewed[0];
      if (!Number.isFinite(Date.parse(part.expires_at)) || now() >= Date.parse(part.expires_at)) throw new VideoUploadExpiredError();
    }
    const url = new URL(part.url);
    if (url.protocol !== "https:" || url.username || url.password) throw new VideoContractError("Upload parts require credential-free HTTPS URLs");
    input.signal?.throwIfAborted();
    const response = await fetchImpl(url, {
      method: "PUT", credentials: "omit", redirect: "error", signal: input.signal,
      body: input.file.slice((number - 1) * upload.part_size_bytes, (number - 1) * upload.part_size_bytes + partSize(number)),
    });
    if (!response.ok) throw new VideoContractError(`Video part upload failed (${response.status}); retry this retained attempt`);
    const receipt = { part_number: number, etag: videoPartEtag(response.headers.get("etag")) };
    await input.saveReceipt(receipt);
    receipts.set(number, receipt);
    progress();
  }
  return [...receipts.values()].sort((a, b) => a.part_number - b.part_number);
}

import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { DancePublicationStatus } from "./dance-publication-status";

test("publication SSR contains only its initial label and no private read or result",()=>{
 const read=vi.fn(),session=vi.fn();
 const html=renderToString(()=><DancePublicationStatus communityId="private-community" reviewId="private-review" initialStatus="transferred" api={{read}} session={session}/>);
 expect(html).toContain("sent for publication");expect(html).not.toMatch(/private-community|private-review|View video post/);
 expect(read).not.toHaveBeenCalled();expect(session).not.toHaveBeenCalled();
});

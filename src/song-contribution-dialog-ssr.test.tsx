import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { SongContributionDialog, type SongContributionDependencies } from "./features/rewards/song-contribution-dialog.tsx";

test("server markup performs no private catalog, journal, wallet or contribution read", () => {
  const dependencies: SongContributionDependencies = {
    catalog: vi.fn<SongContributionDependencies["catalog"]>(), api: vi.fn<SongContributionDependencies["api"]>(),
    journal: vi.fn<SongContributionDependencies["journal"]>(), store: vi.fn<SongContributionDependencies["store"]>(),
    authorization: vi.fn<SongContributionDependencies["authorization"]>(), previous: vi.fn<SongContributionDependencies["previous"]>(),
  };
  const html = renderToString(() => <SongContributionDialog communityId="private-community" postId="private-song" songTitle="Public song" onClose={() => {}} dependencies={dependencies} />);
  expect(html).not.toMatch(/private-community|private-song|Original contribution|Pay 2 USDC/u);
  for (const operation of Object.values(dependencies)) expect(operation).not.toHaveBeenCalled();
});

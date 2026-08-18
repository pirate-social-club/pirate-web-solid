import { Title } from "@solidjs/meta";
import { KaraokePracticeSurface } from "../features/karaoke/karaoke-practice-surface";
import { toKaraokeStageLines } from "../features/karaoke/lyric-transform";

const demoLines = toKaraokeStageLines([
  { start_ms: 0, end_ms: 2400, text: "Sing it back to the night", words: [
    { start_ms: 0, end_ms: 600, text: "Sing" }, { start_ms: 650, end_ms: 900, text: "it" },
    { start_ms: 950, end_ms: 1200, text: "back" }, { start_ms: 1300, end_ms: 2400, text: "to the night" },
  ] },
  { start_ms: 3000, end_ms: 5200, text: "Let the bright song carry on" },
  { start_ms: 5800, end_ms: 8200, text: "Every word becomes a spark" },
]);

export default function KaraokeRoute() {
  return (
    <>
      <Title>Karaoke · Pirate</Title>
      <KaraokePracticeSurface artistName="Demo session" lines={demoLines} title="Sing it back" />
    </>
  );
}

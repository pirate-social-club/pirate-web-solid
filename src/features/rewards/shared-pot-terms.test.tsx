import { render } from "@solidjs/web";
import { afterEach,expect,it } from "vitest";
import { DanceFundedObjectives } from "../dance/dance-funded-objectives.tsx";
import { dancePreparationFixture } from "../dance/dance-preparation.fixture.ts";
import { SharedSongParticipationView } from "./shared-song-participation.tsx";
import { sharedSongParticipationFixture } from "./shared-song-participation.fixtures.ts";
import { sharedPotDisposition } from "./shared-pot-terms.ts";

const dispose: (()=>void)[]=[];
afterEach(()=>{dispose.splice(0).forEach(fn=>fn());document.body.replaceChildren();});
const recipient="0x1111111111111111111111111111111111111111";
const cases=[
  {empty_behavior:"no_purchase",text:"If nobody qualifies, there is no allocation."},
  {empty_behavior:"single_funder_ticket_first_v1",text:"any net winnings go to the pot’s single funder"},
  {empty_behavior:"safe_treasury_ticket_first_v1",empty_winnings_recipient:recipient,text:"any net winnings stay in this pot’s Safe as treasury funds"},
] as const;
for(const value of cases) for(const screen of ["Study","Dance"] as const) it(`${screen} displays its captured ${value.empty_behavior} disposition`,()=>{
  const participation=sharedSongParticipationFixture();
  const terms={...participation.terms,empty_behavior:value.empty_behavior,...("empty_winnings_recipient" in value ? {empty_winnings_recipient:value.empty_winnings_recipient}: {})};
  const host=document.createElement("div");document.body.appendChild(host);
  if(screen==="Study") dispose.push(render(()=> <SharedSongParticipationView participation={{...participation,terms}} now={Date.now()} />,host));
  else {const original=dancePreparationFixture.objectives[0];if(!original) throw Error("fixture objective missing");dispose.push(render(()=> <DanceFundedObjectives context={{...dancePreparationFixture,objectives:[{...original,terms}]}} onAccept={()=>{}} />,host));}
  expect(host.textContent).toContain(value.text);
  expect(host.textContent).not.toContain("no ticket is purchased");
  if(value.empty_behavior==="no_purchase") expect(host.textContent).not.toContain("Its cost is spent");
  if(value.empty_behavior==="safe_treasury_ticket_first_v1") expect(host.textContent).toContain(recipient);
});
it("rejects treasury terms without a frozen recipient",()=>{
  expect(()=>sharedPotDisposition({empty_behavior:"safe_treasury_ticket_first_v1"})).toThrow("reward_treasury_terms_invalid");
});

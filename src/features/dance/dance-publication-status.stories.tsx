import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { DancePublicationStatus } from "./dance-publication-status";
import type { DancePublicationView } from "./dance-publication-api";

const session=async()=>({status:"authenticated",userId:"storybook",personas:[]}) as const;
const publication={version:"dance-moderated-publication-v1",review_id:"review",status:"transferred",submission:{submission_id:"ordinary",href:"/media-post-submissions/ordinary"}} as const;
const processing: DancePublicationView={publication,post:{submission_id:"ordinary",author_persona:{object:"persona",persona_id:"persona",display_name:null,avatar_ref:null,primary_public_handle:null},href:"/media-post-submissions/ordinary",track:"video",intent:"song_reference",creation_revision:1,video_revision:1,caption:null,updated_at:"2026-10-23T00:00:00Z",status:"processing",phase:"analysis"}};
const meta={title:"Dance/Publication status",component:DancePublicationStatus,args:{communityId:"community",reviewId:"review",initialStatus:"transferred",session},parameters:{layout:"centered"}} satisfies Meta<typeof DancePublicationStatus>;
export default meta;
type Story=StoryObj<typeof meta>;
export const SentForPublication: Story={args:{api:{read:async()=>processing}}};
export const Preparing: Story={args:{initialStatus:"pending",api:{read:async()=>({publication:{...publication,status:"pending",submission:null},post:null})}}};
export const Published: Story={args:{api:{read:async()=>({publication,post:{...processing.post!,status:"published",published_resource:{post_id:"published-video",href:"/posts/published-video"}}})}}};
export const Unconfirmed: Story={args:{api:{read:async()=>{throw new Error("offline status unavailable");}}}};

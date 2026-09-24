/**
 * Terms and Privacy copy. Written from the product specifications and the
 * providers the service actually calls. No operator entity, jurisdiction or
 * public contact address exists yet, so the documents say so instead of
 * naming one. Review by counsel is still expected before production launch.
 */

export interface LegalSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly items?: readonly string[];
}

export interface LegalDocumentContent {
  readonly path: "/terms" | "/privacy";
  readonly title: string;
  readonly updated: string;
  readonly summary: string;
  readonly sections: readonly LegalSection[];
}

const pendingDetails =
  "This is an early version of the service. Before launch we will publish the name of the operator, a contact address and the law that governs these documents here.";

export const termsOfService: LegalDocumentContent = {
  path: "/terms",
  title: "Terms of Service",
  updated: "23 September 2026",
  summary:
    "These terms cover your use of this app: your account and profiles, what you post, how communities work, and the wallets that come with your profiles.",
  sections: [
    {
      heading: "Who can use the app",
      paragraphs: [
        "You must be at least 16 years old. When you create an account you confirm that you are.",
        "Some content is rated 18+. To view it you must prove you are over 18 with a supported age check (currently Self or ZKPassport). Each community decides who may join; some ask for a palm scan with Very or a document check of your nationality.",
      ],
    },
    {
      heading: "Your account and profiles",
      paragraphs: [
        "You sign in with an email code, Google, X or a crypto wallet. Sign-in is handled by our authentication provider, Privy. Keep access to your sign-in method secure; you are responsible for activity on your account.",
        "Your account is private. What others see are your profiles. A profile belongs to one community, has its own name, handle and wallet, and is never shown as linked to your other profiles.",
      ],
    },
    {
      heading: "What you post",
      paragraphs: [
        "You keep ownership of the songs, videos, images, lyrics, posts and comments you publish. You give us permission to store, process and show them in the app. That includes transcoding media, checking it for policy violations, matching audio against a fingerprint database, transcribing it and translating it.",
        "When you publish a song, its audio, artwork and details are stored on IPFS and registered on the DATA Network (formerly Story) under a commercial remix licence: others may remix it and sell their remix with credit, and you receive the share of their remix earnings you set when you publish. A song submission that was given a different licence before 24 September 2026 keeps that licence. These public records are permanent. We cannot remove them from IPFS or the chain, even if you later delete the post or your account.",
        "You must have the rights to what you post. A fingerprint match with a known recording blocks publication, but passing that check is not a copyright clearance.",
      ],
    },
    {
      heading: "Rules",
      items: [
        "Do not post content you do not have the rights to.",
        "Do not post sexual content involving anyone under 18. We remove it, and those decisions cannot be appealed.",
        "Mark adult content as 18+ where the app asks you to. Songs are rated by our checks rather than by you. Content our checks find to be sexual or graphically violent is rated 18+ and cannot be rated lower.",
        "Do not harass, threaten or impersonate others, and do not use the app for anything illegal.",
        "Do not interfere with the service, other people's accounts or the scoring of Study and Karaoke.",
      ],
    },
    {
      heading: "Communities and moderation",
      paragraphs: [
        "Community owners set their community's rules and moderate it. They may remove posts or members. We may also remove content, withhold media or suspend accounts that break these terms or the law.",
      ],
    },
    {
      heading: "Wallets and money",
      paragraphs: [
        "Each profile gets its own wallet, created through Privy. Signing anything with it requires proof that you control it, and we never move funds between your profiles. Blockchain transactions cannot be reversed, and wallet addresses and transactions are public.",
        "Testnet tokens have no monetary value. Rewards, paid handles and Megapot tickets are not available yet. When they are, they will come with their own eligibility rules and disclosures. Nothing in the app is financial or investment advice.",
      ],
    },
    {
      heading: "The service",
      paragraphs: [
        "The app is provided as it is, while we are still building it. Features may change, pause or stop, and we cannot promise it will always be available or error free. To the extent the law allows, we are not liable for indirect losses or for losses caused by blockchains, wallets or other services we do not control.",
        "You may stop using the app at any time. Deleting an account from the app is not available yet; see the Privacy Policy. We may suspend or end access for accounts that break these terms.",
      ],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "If we change these terms we will update this page and the date above.",
        pendingDetails,
      ],
    },
  ],
};

export const privacyPolicy: LegalDocumentContent = {
  path: "/privacy",
  title: "Privacy Policy",
  updated: "23 September 2026",
  summary:
    "This explains what we collect, why, who processes it for us, what is public by design and how deletion works. We do not use advertising trackers or analytics tools.",
  sections: [
    {
      heading: "What we collect",
      items: [
        "Sign-in details: your email address, or the Google, X or wallet account you sign in with.",
        "Profiles: names, handles, avatars and the community each profile belongs to.",
        "What you post: songs, videos, images, lyrics, posts, comments, votes and follows.",
        "Practice activity: Study answers and transcripts, Karaoke scores, streaks and leaderboard results.",
        "Microphone recordings from Study and Karaoke.",
        "Verification results: whether you passed an age, palm or nationality check. We keep the result, not your documents.",
        "Wallets: one wallet address per profile.",
        "Technical data: your IP address, used to prevent abuse and protect media playback, and your approximate region, which may set your streak time zone.",
      ],
    },
    {
      heading: "Cookies and storage",
      paragraphs: [
        "We use two cookies, both required: one keeps you signed in and one protects your actions against cross-site requests. Your browser also stores preferences, drafts and notices you have already seen. We do not use advertising or analytics cookies.",
      ],
    },
    {
      heading: "Your profiles are kept apart",
      paragraphs: [
        "People see your profiles, not your account. We do not show that two profiles belong to the same account. Access to that link is limited to safety review and is audited. Using the same profile wallet on different networks does link that profile's activity across them.",
      ],
    },
    {
      heading: "Who processes data for us",
      items: [
        "Privy: sign-in and profile wallets.",
        "Cloudflare: hosting, storage, video delivery and logs.",
        "PlanetScale: our database.",
        "ElevenLabs: speech-to-text for Study and Karaoke, and lining up lyrics with songs.",
        "OpenAI: checking text and images against our content rules.",
        "OpenRouter and the model providers it routes to: lyric classification, translation and Study exercises.",
        "ACRCloud: audio fingerprinting.",
        "Qencode: converting audio and video.",
        "Filebase (IPFS) and the DATA Network: public storage and registration of published songs.",
        "Very, Self and ZKPassport: palm, age and nationality checks you choose to take.",
      ],
    },
    {
      heading: "Microphone recordings",
      paragraphs: [
        "When you practise with your microphone, the recording is sent to ElevenLabs for speech-to-text, and ElevenLabs may keep it under its own policy. We also store the recording privately and set it to expire 24 months after it is made. We do not use it to identify you by voice or to train models. You can delete your stored recordings at any time in Settings.",
      ],
    },
    {
      heading: "What is public",
      paragraphs: [
        "Your profiles, posts and published songs are public. Published song audio, artwork and details are stored on IPFS and registered on the DATA Network. Wallet addresses and blockchain transactions are public too. These public records are permanent, and we cannot delete them.",
      ],
    },
    {
      heading: "Keeping and deleting data",
      paragraphs: [
        "Original uploads used to make a video are kept for 30 days. Published media is kept for as long as the post exists. Some service logs cannot be deleted for one person and expire on their own schedule.",
        "Deleting your whole account is not available in the app yet. We are building it to follow these rules: your profile details, preferences, follows, drafts, recordings, transcripts and raw verification details are deleted; posts you published stay up under a \"Retired account\" profile and your handle is retired so no one else can take it; records we need for money movements, blockchain actions, moderation and verification decisions are kept in minimised form; and deletion waits while you are the only owner of a community, hold domain authority for one, have a wallet balance or have a payout pending.",
      ],
    },
    {
      heading: "Your choices",
      items: [
        "Delete your stored Study and Karaoke recordings in Settings.",
        "Requests to see, correct or delete your data, or to object to how it is used, will be handled through the contact address we publish before launch.",
      ],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "If we change this policy we will update this page and the date above.",
        pendingDetails,
      ],
    },
  ],
};

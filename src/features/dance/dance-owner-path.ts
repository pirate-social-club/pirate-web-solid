export const danceOwnerPath = (communityId: string, reviewId?: string) => `/dance/${encodeURIComponent(communityId)}/owner-reviews${reviewId ? `/${encodeURIComponent(reviewId)}` : ""}`;

import { privacyPolicy } from "../features/legal/legal-content.ts";
import { LegalDocument } from "../features/legal/legal-document.tsx";

export default function PrivacyRoute() {
  return <LegalDocument document={privacyPolicy} />;
}

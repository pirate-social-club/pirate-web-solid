import { termsOfService } from "../features/legal/legal-content.ts";
import { LegalDocument } from "../features/legal/legal-document.tsx";

export default function TermsRoute() {
  return <LegalDocument document={termsOfService} />;
}

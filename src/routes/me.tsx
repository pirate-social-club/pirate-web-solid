import { useNavigate } from "@solidjs/router";
import { AccountPage } from "../features/shell/account-page.tsx";

export default function ProfileRoute() {
  const navigate = useNavigate();
  return <AccountPage profile navigate={href => navigate(href)} />;
}

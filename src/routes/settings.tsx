import { useNavigate } from "@solidjs/router";
import { AccountPage } from "../features/shell/account-page.tsx";

export default function SettingsRoute() {
  const navigate = useNavigate();
  return <AccountPage navigate={href => navigate(href)} />;
}

import AdminDashboardClient from "../components/AdminDashboardClient";
import { requirePageSession } from "../lib/portalPage";

export default function AdminPage() {
  requirePageSession("admin", "/admin");
  return <AdminDashboardClient />;
}

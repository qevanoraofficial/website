import type { Metadata } from "next";
import OrderNotifications from "@/components/notifications/OrderNotifications";

export const metadata: Metadata = {
  title: "Notifikasi | QEVANORA OFFICIAL",
  description: "Notifikasi order QEVANORA OFFICIAL.",
};

export default function NotificationsPage() {
  return <OrderNotifications />;
}

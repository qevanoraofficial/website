"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readCustomerProfile } from "@/lib/customer-profile";
import { setOrderPageNotice } from "@/lib/order-notifications";
import { createClient } from "@/lib/supabase/client";

type BuyProductButtonProps = {
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  stock: number;
};

export default function BuyProductButton({
  productId,
  stock,
}: BuyProductButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);

  const openNotifications = () => {
    router.push("/notifications");
  };

  const handleBuy = async () => {
    if (isSending) {
      return;
    }

    if (stock <= 0) {
      setOrderPageNotice("Stok produk sedang habis.");
      openNotifications();
      return;
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setOrderPageNotice("Silakan masuk ke akun QEVANORA terlebih dahulu.");
      router.push("/login");
      return;
    }

    const profile = readCustomerProfile();

    if (!profile) {
      setOrderPageNotice(
        "Lengkapi Nama dan WhatsApp pada halaman Profile Account terlebih dahulu."
      );
      router.push("/profile");
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          profile: {
            name: profile.name,
            telegram: profile.telegram,
            whatsapp: profile.whatsapp,
          },
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        orderId?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.orderId) {
        throw new Error(payload.error || "Order gagal disimpan.");
      }

      setOrderPageNotice(
        `Order ${payload.orderId} berhasil dibuat dan sedang menunggu konfirmasi admin.`
      );
    } catch (error) {
      setOrderPageNotice(
        error instanceof Error
          ? error.message
          : "Order gagal disimpan. Silakan coba kembali."
      );
    } finally {
      setIsSending(false);
      openNotifications();
    }
  };

  return (
    <button
      type="button"
      onClick={handleBuy}
      disabled={isSending || stock <= 0}
      className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSending ? "Mengirim..." : stock > 0 ? "Beli" : "Stok Habis"}
    </button>
  );
}

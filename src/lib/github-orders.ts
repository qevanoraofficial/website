import "server-only";
import ordersFallback from "@/data/orders.json";
import {
  getStoragePaths,
  readJsonArray,
  updateJsonArray,
} from "@/lib/github-store";

export type StoredOrderStatus =
  | "pending"
  | "completed"
  | "cancelled"
  | "failed";

export type StoredOrder = {
  id: string;
  ownerKey: string;
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  customerName?: string;
  whatsapp?: string;
  telegram?: string;
  status: StoredOrderStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const fallback = ordersFallback as StoredOrder[];

async function readOrders(): Promise<StoredOrder[]> {
  const { orders } = getStoragePaths();
  return (await readJsonArray<StoredOrder>(orders, fallback)).data;
}

export async function getStoredOrders(): Promise<StoredOrder[]> {
  const orders = await readOrders();
  return orders
    .sort(
      (first, second) =>
        new Date(second.createdAt || 0).getTime() -
        new Date(first.createdAt || 0).getTime(),
    )
    .slice(0, 1000);
}

export async function createPendingOrder(order: StoredOrder): Promise<void> {
  const { orders } = getStoragePaths();
  await updateJsonArray<StoredOrder, void>(
    orders,
    fallback,
    `order: buat ${order.id}`,
    (current) => ({
      data: [order, ...current.filter((item) => item.id !== order.id)].slice(
        0,
        1000,
      ),
      result: undefined,
    }),
  );
}

export async function setStoredOrderStatus(
  orderId: string,
  status: StoredOrderStatus,
  errorMessage?: string,
): Promise<StoredOrder | null> {
  const { orders } = getStoragePaths();

  try {
    return await updateJsonArray<StoredOrder, StoredOrder>(
      orders,
      fallback,
      `order: status ${orderId} ${status}`,
      (current) => {
        const index = current.findIndex((order) => order.id === orderId);
        if (index < 0) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const updated: StoredOrder = {
          ...current[index],
          status,
          updatedAt: new Date().toISOString(),
          error: errorMessage || "",
        };
        const next = [...current];
        next[index] = updated;
        return { data: next, result: updated };
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function getStoredOrdersForOwner(
  ownerKey: string,
): Promise<StoredOrder[]> {
  const orders = await readOrders();
  return orders
    .filter(
      (order) =>
        typeof order.ownerKey === "string" && order.ownerKey === ownerKey,
    )
    .sort(
      (first, second) =>
        new Date(second.createdAt || 0).getTime() -
        new Date(first.createdAt || 0).getTime(),
    )
    .slice(0, 50);
}

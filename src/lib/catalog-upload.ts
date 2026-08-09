import "server-only";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function cleanText(
  value: FormDataEntryValue | unknown,
  maxLength: number,
): string {
  return String(typeof value === "string" ? value : "")
    .trim()
    .slice(0, maxLength);
}

export function parseNonNegativeNumber(
  value: FormDataEntryValue | unknown,
  fieldName: string,
): number {
  const normalized = String(typeof value === "string" ? value : "")
    .replaceAll(".", "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} harus berupa angka nol atau lebih.`);
  }

  return parsed;
}

export function parseStock(
  value: FormDataEntryValue | unknown,
): number {
  const parsed = parseNonNegativeNumber(value, "Stok");
  if (!Number.isInteger(parsed)) {
    throw new Error("Stok harus berupa bilangan bulat.");
  }
  return parsed;
}

export function slugifyCategory(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!slug) {
    throw new Error("Nama kategori tidak dapat dijadikan slug URL.");
  }

  return slug;
}

export async function readImageUpload(
  value: FormDataEntryValue | null,
): Promise<{ bytes: Buffer; extension: string; contentType: string }> {
  if (!(value instanceof File) || value.size <= 0) {
    throw new Error("Gambar wajib dikirim.");
  }

  const extension = IMAGE_TYPES[value.type];
  if (!extension) {
    throw new Error("Format gambar harus JPG, PNG, atau WEBP.");
  }

  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran gambar maksimal 4 MB.");
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  const validSignature =
    (value.type === "image/jpeg" &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (value.type === "image/png" &&
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )) ||
    (value.type === "image/webp" &&
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP");

  if (!validSignature) {
    throw new Error("Isi file tidak cocok dengan format gambar yang dikirim.");
  }

  return {
    bytes,
    extension,
    contentType: value.type,
  };
}

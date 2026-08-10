import "server-only";

const API_VERSION = "2022-11-28";
const MAX_WRITE_ATTEMPTS = 4;

type GitHubContentPayload = {
  content?: string;
  encoding?: string;
  sha?: string;
  download_url?: string | null;
};

export type RepositoryFile = {
  bytes: Buffer;
  sha: string | null;
};

type JsonArraySnapshot<T> = {
  data: T[];
  sha: string | null;
};

export type JsonMutationResult<T, R> = {
  data: T[];
  result: R;
};

function cleanEnv(name: string, fallback = ""): string {
  return String(process.env[name] || fallback).trim();
}

export function getRepositoryConfig() {
  const token = cleanEnv("GITHUB_TOKEN");
  const owner = cleanEnv("GITHUB_OWNER", "qevanoraofficial");
  const repo = cleanEnv("GITHUB_REPO", "website");
  const branch = cleanEnv("GITHUB_BRANCH", "main");

  if (!token) {
    throw new Error("GITHUB_TOKEN belum diatur di Vercel.");
  }

  if (!owner || !repo || !branch) {
    throw new Error("Konfigurasi repository GitHub belum lengkap.");
  }

  return { token, owner, repo, branch };
}

export function getStoragePaths() {
  return {
    products: cleanEnv("PRODUCTS_FILE", "src/data/products.json"),
    testimonials: cleanEnv(
      "TESTIMONIALS_FILE",
      "src/data/testimonials.json",
    ),
    orders: cleanEnv("ORDERS_FILE", "src/data/orders.json"),
  };
}

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function contentUrl(path: string): string {
  const { owner, repo } = getRepositoryConfig();
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
}

function githubHeaders(): Record<string, string> {
  const { token } = getRepositoryConfig();
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "Qevanora-Official-Admin",
  };
}

async function githubError(response: Response, operation: string): Promise<Error> {
  const details = (await response.text()).slice(0, 300);
  return new Error(`${operation} (${response.status}): ${details}`);
}

export async function readRepositoryRawFile(
  path: string,
): Promise<RepositoryFile | null> {
  const { branch } = getRepositoryConfig();
  const response = await fetch(
    `${contentUrl(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        ...githubHeaders(),
        Accept: "application/vnd.github.raw+json",
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await githubError(response, `GitHub gagal membaca media ${path}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    sha: response.headers.get("etag")?.replaceAll('"', "") || null,
  };
}

export async function readRepositoryFile(
  path: string,
): Promise<RepositoryFile | null> {
  const { branch } = getRepositoryConfig();
  const response = await fetch(
    `${contentUrl(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders(),
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await githubError(response, `GitHub gagal membaca ${path}`);
  }

  const payload = (await response.json()) as GitHubContentPayload;
  let bytes = Buffer.alloc(0);

  if (payload.content && payload.encoding === "base64") {
    bytes = Buffer.from(payload.content.replaceAll("\n", ""), "base64");
  } else if (payload.download_url) {
    const downloadResponse = await fetch(payload.download_url, {
      headers: githubHeaders(),
      cache: "no-store",
    });

    if (!downloadResponse.ok) {
      throw await githubError(
        downloadResponse,
        `GitHub gagal mengunduh ${path}`,
      );
    }

    bytes = Buffer.from(await downloadResponse.arrayBuffer());
  }

  return {
    bytes,
    sha: payload.sha || null,
  };
}

export async function readJsonArray<T>(
  path: string,
  fallback: T[] = [],
): Promise<JsonArraySnapshot<T>> {
  const file = await readRepositoryFile(path);

  if (!file) {
    return { data: [...fallback], sha: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.bytes.toString("utf8") || "[]");
  } catch {
    throw new Error(`Isi ${path} bukan JSON yang valid.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Isi ${path} harus berupa array JSON.`);
  }

  return {
    data: parsed as T[],
    sha: file.sha,
  };
}

export async function writeRepositoryFile(
  path: string,
  bytes: Buffer,
  message: string,
  sha: string | null = null,
): Promise<void> {
  const { branch } = getRepositoryConfig();
  const body: {
    message: string;
    content: string;
    branch: string;
    sha?: string;
  } = {
    message,
    content: bytes.toString("base64"),
    branch,
  };

  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(contentUrl(path), {
    method: "PUT",
    headers: {
      ...githubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      const { owner, repo } = getRepositoryConfig();
      const details = (await response.text()).slice(0, 300);
      throw new Error(
        `GitHub gagal menyimpan ${path} (404) ke ${owner}/${repo}. ` +
          `Pastikan GITHUB_TOKEN memiliki akses Contents: Read and write ke repository tersebut, ` +
          `GITHUB_OWNER/GITHUB_REPO benar, dan branch ${branch} tersedia. Detail: ${details}`,
      );
    }
    throw await githubError(response, `GitHub gagal menyimpan ${path}`);
  }
}

export async function deleteRepositoryFile(
  path: string,
  message: string,
): Promise<boolean> {
  const current = await readRepositoryFile(path);
  if (!current?.sha) {
    return false;
  }

  const { branch } = getRepositoryConfig();
  const response = await fetch(contentUrl(path), {
    method: "DELETE",
    headers: {
      ...githubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, sha: current.sha, branch }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw await githubError(response, `GitHub gagal menghapus ${path}`);
  }

  return true;
}

function isWriteConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("(409)") || message.includes("(422)");
}

export async function updateJsonArray<T, R>(
  path: string,
  fallback: T[],
  message: string,
  mutate: (current: T[]) => JsonMutationResult<T, R>,
): Promise<R> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const snapshot = await readJsonArray<T>(path, fallback);
      const mutation = mutate([...snapshot.data]);
      const content = Buffer.from(
        `${JSON.stringify(mutation.data, null, 2)}\n`,
        "utf8",
      );

      await writeRepositoryFile(path, content, message, snapshot.sha);
      return mutation.result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_WRITE_ATTEMPTS && isWriteConflict(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("GitHub gagal menyimpan perubahan.");
}

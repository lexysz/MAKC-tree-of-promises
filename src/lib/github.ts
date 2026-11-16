import type { TreeData } from "../data/tree";

const REPO_OWNER = "lexysz";
const REPO_NAME = "MAKC-tree-of-promises";
const TREE_PATH = "src/data/tree.json";
const LOGO_PATH = "src/assets/company-logo.png";
const TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

if (!TOKEN) {
  throw new Error(
    "Отсутствует переменная окружения VITE_GITHUB_TOKEN. " +
    "Создайте Personal Access Token в GitHub и добавьте его в Secrets репозитория."
  );
}

const BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

interface GitHubFile {
  content: string;
  sha: string;
}

async function getFile(path: string): Promise<GitHubFile | null> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  return { content: data.content, sha: data.sha };
}

async function putFile(
  path: string,
  contentBase64: string,
  sha: string,
  message: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      sha,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }
}

export async function loadTreeFromGitHub(): Promise<TreeData | null> {
  const file = await getFile(TREE_PATH);
  if (!file) return null;
  const json = atob(file.content);
  return JSON.parse(json) as TreeData;
}

export async function saveTreeToGitHub(data: TreeData): Promise<void> {
  const file = await getFile(TREE_PATH);
  const content = btoa(JSON.stringify(data, null, 2));
  const message = `Update tree data ${new Date().toISOString()}`;
  await putFile(TREE_PATH, content, file?.sha ?? "", message);
}

export async function loadLogoFromGitHub(): Promise<string | null> {
  const file = await getFile(LOGO_PATH);
  if (!file) return null;
  return `data:image/png;base64,${file.content}`;
}

export async function saveLogoToGitHub(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const existing = await getFile(LOGO_PATH);
  await putFile(
    LOGO_PATH,
    base64,
    existing?.sha ?? "",
    `Update logo ${new Date().toISOString()}`
  );
  return `data:image/png;base64,${base64}`;
}

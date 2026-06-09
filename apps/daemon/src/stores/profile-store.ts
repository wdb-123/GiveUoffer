import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CareerProfileOverview } from "@ucareer/shared";

export interface ProfileStore {
  getProfileOverview(): Promise<CareerProfileOverview>;
}

export function createProfileStore(workspaceRoot: string): ProfileStore {
  const cvPath = join(workspaceRoot, "workspace/profile/cv.md");
  const profilePath = join(workspaceRoot, "workspace/profile/profile.yml");
  const profileOverlayPath = join(workspaceRoot, "workspace/profile/_profile.md");

  return {
    async getProfileOverview() {
      const [cvMarkdown, profileYaml, profileOverlayMarkdown] = await Promise.all([
        readOptionalFile(cvPath),
        readOptionalFile(profilePath),
        readOptionalFile(profileOverlayPath),
      ]);
      return {
        candidate: {
          fullName: readYamlScalar(profileYaml, "full_name"),
          email: readYamlScalar(profileYaml, "email"),
          phone: readYamlScalar(profileYaml, "phone"),
          location: readYamlScalar(profileYaml, "location"),
          github: readYamlScalar(profileYaml, "github"),
        },
        headline: readYamlScalar(profileYaml, "headline"),
        targetRoles: readPrimaryRoles(profileYaml),
        cvTitle: cvMarkdown.match(/^#\s+(.+)$/m)?.[1] || "",
        cvMarkdown,
        profileYaml,
        profileOverlayMarkdown,
      };
    },
  };
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "";
    throw error;
  }
}

function readYamlScalar(yaml: string, key: string): string {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m");
  const raw = yaml.match(pattern)?.[1]?.trim() || "";
  return raw.replace(/^["']|["']$/g, "");
}

function readPrimaryRoles(yaml: string): string[] {
  const primaryBlock = yaml.match(/^\s*primary:\s*\n([\s\S]*?)(?=^\s*[a-zA-Z_]+:|\n\n)/m)?.[1] || "";
  return primaryBlock
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*(.+?)\s*$/)?.[1]?.replace(/^["']|["']$/g, "").trim() || "")
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

interface LocalFontDescriptor {
  family: string;
  fullName?: string;
}

interface LocalFontWindow extends Window {
  queryLocalFonts?: () => Promise<LocalFontDescriptor[]>;
}

export interface WindowsFontRegistryEntry {
  name: string;
  value?: string;
}

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
]);

export type GenericFontFamily = "serif" | "sans-serif" | "monospace";

export function extractFontFamilyNames(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((item) => item.trim().replace(/^(["'])(.*)\1$/, "$2"))
    .filter((item) => item && !GENERIC_FAMILIES.has(item.toLowerCase()));
}

export function getPrimaryFontName(fontFamily: string): string {
  return extractFontFamilyNames(fontFamily)[0] ?? "跟随正文";
}

export function getFontStackSummary(fontFamily: string): string {
  const names = extractFontFamilyNames(fontFamily);
  if (names.length === 0) return "仅使用系统后备字体";
  return names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;
}

export function extractGenericFontFamily(
  fontFamily: string,
  fallback: GenericFontFamily = "serif",
): GenericFontFamily {
  const tokens = fontFamily.split(",").map((item) => item.trim().toLowerCase());
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token === "serif" || token === "sans-serif" || token === "monospace") return token;
  }
  return fallback;
}

export function fontNameToCssFamily(fontName: string): string {
  const escaped = fontName.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return escaped ? `"${escaped}"` : "serif";
}

export function createFontFamilyStack(
  fontNames: readonly string[],
  genericFallback: GenericFontFamily,
): string {
  const seen = new Set<string>();
  const normalized = fontNames.flatMap((font) => {
    const name = font.trim();
    const identity = name.toLocaleLowerCase("zh-CN");
    if (!name || seen.has(identity) || GENERIC_FAMILIES.has(identity)) return [];
    seen.add(identity);
    return [fontNameToCssFamily(name)];
  });
  return [...normalized, genericFallback].join(", ");
}

export function extractWindowsFontFamilies(
  entries: readonly WindowsFontRegistryEntry[],
): string[] {
  const families = new Set<string>();
  for (const entry of entries) {
    const cleaned = entry.name
      .replace(/\s+\((?:TrueType|OpenType|Raster|Type 1)\)$/i, "")
      .trim();
    if (!cleaned || cleaned.startsWith("@")) continue;
    for (const name of cleaned.split(/\s+&\s+/)) {
      const normalized = name.trim();
      if (normalized) families.add(normalized);
    }
  }
  return [...families].sort((left, right) =>
    left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }),
  );
}

async function queryBrowserFonts(): Promise<string[]> {
  const queryLocalFonts = (window as LocalFontWindow).queryLocalFonts;
  if (!queryLocalFonts) return [];
  try {
    const fonts = await queryLocalFonts.call(window);
    return [...new Set(fonts.map((font) => font.family.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function queryWindowsRegistry(): Promise<string[]> {
  if (typeof process === "undefined" || process.platform !== "win32") {
    return Promise.resolve([]);
  }

  const command = [
    "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()",
    "$paths=@('Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','Registry::HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')",
    "$result=@()",
    "foreach($path in $paths){if(Test-Path -LiteralPath $path){$item=Get-ItemProperty -LiteralPath $path;$result+=$item.PSObject.Properties|Where-Object{$_.Name -notlike 'PS*'}|ForEach-Object{[PSCustomObject]@{name=$_.Name;value=[string]$_.Value}}}}",
    "$result|ConvertTo-Json -Compress",
  ].join(";");

  return new Promise((resolve) => {
    try {
      const { execFile } = require("child_process") as typeof import("child_process");
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        {
          encoding: "utf8",
          windowsHide: true,
          timeout: 6000,
          maxBuffer: 2 * 1024 * 1024,
        },
        (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve([]);
            return;
          }
          try {
            const parsed = JSON.parse(stdout.replace(/^\uFEFF/, "").trim()) as
              | WindowsFontRegistryEntry
              | WindowsFontRegistryEntry[];
            resolve(extractWindowsFontFamilies(Array.isArray(parsed) ? parsed : [parsed]));
          } catch {
            resolve([]);
          }
        },
      );
    } catch {
      resolve([]);
    }
  });
}

let cachedFonts: Promise<string[]> | null = null;

export function getInstalledFontFamilies(refresh = false): Promise<string[]> {
  if (!refresh && cachedFonts) return cachedFonts;
  cachedFonts = (async () => {
    const windowsFonts = await queryWindowsRegistry();
    const browserFonts = windowsFonts.length > 0 ? [] : await queryBrowserFonts();
    return [...new Set([...windowsFonts, ...browserFonts])].sort((left, right) =>
      left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }),
    );
  })();
  return cachedFonts;
}

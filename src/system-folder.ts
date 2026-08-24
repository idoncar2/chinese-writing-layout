export function focusWindowsFolder(folderPath: string): Promise<boolean> {
  if (typeof process === "undefined" || process.platform !== "win32") {
    return Promise.resolve(false);
  }

  const command = [
    "$target=[IO.Path]::GetFullPath($env:CW_EXPORT_PATH).TrimEnd([IO.Path]::DirectorySeparatorChar)",
    "$shell=New-Object -ComObject Shell.Application",
    "$deadline=[DateTime]::UtcNow.AddSeconds(2)",
    "$window=$null",
    "do{foreach($candidate in @($shell.Windows())){try{$candidatePath=[IO.Path]::GetFullPath([string]$candidate.Document.Folder.Self.Path).TrimEnd([IO.Path]::DirectorySeparatorChar);if([String]::Equals($candidatePath,$target,[StringComparison]::OrdinalIgnoreCase)){$window=$candidate;break}}catch{}};if(-not $window){Start-Sleep -Milliseconds 100}}while((-not $window)-and([DateTime]::UtcNow-lt$deadline))",
    "if(-not $window){Write-Output 'false';exit 0}",
    "Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);' -Name NativeMethods -Namespace Cw",
    "$handle=[IntPtr]([long]$window.HWND)",
    "$null=[Cw.NativeMethods]::ShowWindowAsync($handle,9)",
    "$focused=[Cw.NativeMethods]::SetForegroundWindow($handle)",
    "Write-Output ($focused.ToString().ToLowerInvariant())",
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
          timeout: 4000,
          maxBuffer: 64 * 1024,
          env: { ...process.env, CW_EXPORT_PATH: folderPath },
        },
        (error, stdout) => resolve(!error && stdout.trim().endsWith("true")),
      );
    } catch {
      resolve(false);
    }
  });
}

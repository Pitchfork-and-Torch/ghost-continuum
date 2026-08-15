// Ghost Continuum portable Windows launcher (thin native stub).
// Compiles to GhostContinuum.exe. Spawns bundled Node + start-stack.
// No cloud, no telemetry. Loopback-only hub remains the app's job.
//
// Build (from repo root or packaging script):
//   csc /nologo /optimize+ /target:exe /out:GhostContinuum.exe GhostContinuumLauncher.cs

using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace GhostContinuum
{
    internal static class Program
    {
        private const string Title = "Ghost Continuum - Command Nexus";

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetConsoleCtrlHandler(ConsoleCtrlDelegate handler, bool add);

        private delegate bool ConsoleCtrlDelegate(uint ctrlType);

        private static Process s_child;

        private static int Main(string[] args)
        {
            try
            {
                Console.Title = Title;
            }
            catch
            {
                /* non-console host */
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            // When run from Visual Studio / bin paths, still resolve next to the exe.
            try
            {
                string exe = Process.GetCurrentProcess().MainModule.FileName;
                if (!string.IsNullOrEmpty(exe))
                {
                    baseDir = Path.GetDirectoryName(exe) ?? baseDir;
                }
            }
            catch
            {
                /* keep BaseDirectory */
            }

            string nodePath = Path.Combine(baseDir, "runtime", "node.exe");
            string appRoot = Path.Combine(baseDir, "app");
            string entry = Path.Combine(appRoot, "bin", "start-stack.js");

            if (!File.Exists(nodePath))
            {
                Fail("Bundled runtime missing:\n  " + nodePath +
                     "\n\nRe-download the portable package. Do not move GhostContinuum.exe alone.");
                return 2;
            }
            if (!File.Exists(entry))
            {
                Fail("Application entry missing:\n  " + entry +
                     "\n\nThe portable package is incomplete.");
                return 3;
            }

            Console.WriteLine();
            Console.WriteLine("  Ghost Continuum portable launcher");
            Console.WriteLine("  Local-first Command Nexus (loopback only)");
            Console.WriteLine("  Data: %USERPROFILE%\\.ghost-continuum");
            Console.WriteLine("  Stop: Ctrl+C in this window");
            Console.WriteLine();

            var psi = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = Quote(entry),
                WorkingDirectory = appRoot,
                UseShellExecute = false,
                CreateNoWindow = false,
            };
            // Forward any CLI args (e.g. future flags).
            if (args != null && args.Length > 0)
            {
                psi.Arguments = Quote(entry) + " " + string.Join(" ", Array.ConvertAll(args, Quote));
            }

            psi.EnvironmentVariables["GC_PORTABLE"] = "1";
            // Keep browser open behavior unless user set GC_NO_BROWSER.
            // Do not force public bind; app code binds 127.0.0.1.

            s_child = new Process { StartInfo = psi, EnableRaisingEvents = true };

            ConsoleCtrlDelegate handler = type =>
            {
                try
                {
                    if (s_child != null && !s_child.HasExited)
                    {
                        // Node maps Ctrl+C when sharing the console group.
                        // Also try a gentle close if still alive shortly after.
                        s_child.CloseMainWindow();
                    }
                }
                catch
                {
                    /* ignore */
                }
                return false; // let default handler also run
            };
            SetConsoleCtrlHandler(handler, true);

            try
            {
                if (!s_child.Start())
                {
                    Fail("Failed to start bundled Node runtime.");
                    return 4;
                }
            }
            catch (Exception ex)
            {
                Fail("Could not launch Ghost Continuum:\n  " + ex.Message);
                return 5;
            }

            s_child.WaitForExit();
            int code = s_child.ExitCode;
            try { s_child.Dispose(); } catch { /* */ }
            return code;
        }

        private static string Quote(string path)
        {
            if (string.IsNullOrEmpty(path)) return "\"\"";
            if (path.IndexOf(' ') < 0 && path.IndexOf('"') < 0) return path;
            return "\"" + path.Replace("\"", "\\\"") + "\"";
        }

        private static void Fail(string message)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("  [ERROR] " + message);
            Console.Error.WriteLine();
            Console.Error.WriteLine("  Press Enter to close...");
            try { Console.ReadLine(); } catch { Thread.Sleep(4000); }
        }
    }
}

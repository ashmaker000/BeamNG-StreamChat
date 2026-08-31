using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class StreamChatSetup
{
    private const string PayloadResource = "BeamNGStreamChat.Payload.zip";

    [STAThread]
    private static int Main()
    {
        string logPath = Path.Combine(Path.GetTempPath(), "BeamNGStreamChat-install.log");
        string extractionDirectory = Path.Combine(Path.GetTempPath(), "BeamNGStreamChat-" + Guid.NewGuid().ToString("N"));

        try
        {
            Directory.CreateDirectory(extractionDirectory);
            string archivePath = Path.Combine(extractionDirectory, "payload.zip");
            ExtractPayloadResource(archivePath);
            ZipFile.ExtractToDirectory(archivePath, extractionDirectory);
            File.Delete(archivePath);

            string scriptPath = Path.Combine(extractionDirectory, "install-release.ps1");
            if (!File.Exists(scriptPath))
            {
                throw new FileNotFoundException("The Stream Chat installation script is missing from the payload.", scriptPath);
            }

            int exitCode = RunPowerShell(scriptPath, logPath);
            if (exitCode != 0)
            {
                ShowFailure(logPath, "PowerShell exited with code " + exitCode + ".");
            }
            return exitCode;
        }
        catch (Exception exception)
        {
            File.WriteAllText(logPath, exception.ToString(), new UTF8Encoding(false));
            ShowFailure(logPath, exception.Message);
            return 1;
        }
        finally
        {
            try
            {
                if (Directory.Exists(extractionDirectory)) Directory.Delete(extractionDirectory, true);
            }
            catch
            {
                // Windows can clear a locked temporary directory later.
            }
        }
    }

    private static void ExtractPayloadResource(string archivePath)
    {
        Assembly assembly = Assembly.GetExecutingAssembly();
        using (Stream input = assembly.GetManifestResourceStream(PayloadResource))
        {
            if (input == null) throw new InvalidDataException("The embedded Stream Chat payload could not be found.");
            using (FileStream output = File.Create(archivePath)) input.CopyTo(output);
        }
    }

    private static int RunPowerShell(string scriptPath, string logPath)
    {
        string powershellPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
        var startInfo = new ProcessStartInfo
        {
            FileName = powershellPath,
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        using (Process process = Process.Start(startInfo))
        {
            string output = process.StandardOutput.ReadToEnd();
            string error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            File.WriteAllText(logPath, output + error, new UTF8Encoding(false));
            return process.ExitCode;
        }
    }

    private static void ShowFailure(string logPath, string detail)
    {
        MessageBox.Show(
            "BeamNG Twitch Chat could not be installed.\n\n" + detail + "\n\nDetails: " + logPath,
            "BeamNG Twitch Chat installation failed",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error
        );
    }
}

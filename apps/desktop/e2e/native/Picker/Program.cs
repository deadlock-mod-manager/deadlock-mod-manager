using System.Diagnostics;
using System.Text.Json;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

if (args.Length is not (2 or 3) || !int.TryParse(args[0], out var processId))
    throw new ArgumentException("Expected application PID and owned world directory");

var world = Path.GetFullPath(args[1]);
using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(world, "world-manifest.json")));
if (manifest.RootElement.GetProperty("owner").GetString() != "dmm-e2e-harness" ||
    manifest.RootElement.GetProperty("configuration").GetProperty("roots").GetProperty("world").GetString() != world)
    throw new InvalidOperationException("Picker requires an owned E2E world");

using var process = Process.GetProcessById(processId);
if (!string.Equals(process.MainModule?.FileName, Environment.GetEnvironmentVariable("DMM_E2E_BINARY"), StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Picker PID does not match the harness binary");

if (args.Length == 3)
{
    NativeInput.Run(process, args[2]);
    return;
}

var fixture = Path.Combine(world, "fixtures", "e2e-local-mod.vpk");
if (!File.Exists(fixture)) throw new FileNotFoundException("Lifecycle fixture is missing", fixture);
using var automation = new UIA3Automation();
var deadline = Stopwatch.StartNew();
AutomationElement? dialog = null;
while (deadline.Elapsed < TimeSpan.FromSeconds(15))
{
    var windows = automation.GetDesktop().FindAllChildren(cf => cf.ByProcessId(processId));
    foreach (var window in windows)
    {
        dialog = window.ClassName == "#32770" ? window : window.FindFirstDescendant(cf => cf.ByClassName("#32770"));
        if (dialog != null) break;
    }
    if (dialog != null) break;
    Thread.Sleep(100);
}
if (dialog == null)
{
    foreach (var window in automation.GetDesktop().FindAllChildren(cf => cf.ByProcessId(processId)))
        Console.Error.WriteLine($"Owned window: {window.ClassName} {window.Name}");
    throw new TimeoutException("Native file picker did not open for the E2E process");
}

var filename = dialog.FindFirstDescendant(cf => cf.ByAutomationId("1148"))
    ?? throw new InvalidOperationException("Native picker filename control is missing");
var edit = filename.ControlType == ControlType.Edit
    ? filename.AsTextBox()
    : filename.FindFirstDescendant(cf => cf.ByControlType(ControlType.Edit))?.AsTextBox();
if (edit == null) throw new InvalidOperationException("Native picker filename edit is missing");
edit.Text = fixture;
var open = dialog.FindFirstDescendant(cf => cf.ByAutomationId("1").And(cf.ByControlType(ControlType.Button)))?.AsButton()
    ?? throw new InvalidOperationException("Native picker Open button is missing");
open.Invoke();
Console.WriteLine(JsonSerializer.Serialize(new { processId, fixture, action = "select-native-file" }));

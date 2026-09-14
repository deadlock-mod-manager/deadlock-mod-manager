using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using FlaUI.Core.Input;
using FlaUI.UIA3;

internal static class NativeInput
{
    private sealed record Request(string Action, double X, double Y, double EndX, double EndY, double Width, double Height);
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool GetClientRect(nint window, out Rect rectangle);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(nint window, ref Point point);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint processId);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint source, uint target, bool attach);
    [DllImport("user32.dll")] private static extern nint SetThreadDpiAwarenessContext(nint context);

    public static void Run(Process process, string json)
    {
        // PER_MONITOR_AWARE_V2 keeps Win32 coordinates in the physical pixels FlaUI uses.
        SetThreadDpiAwarenessContext(new nint(-4));
        var request = JsonSerializer.Deserialize<Request>(json) ?? throw new ArgumentException("Missing input request");
        if (request.Action is not ("click" or "drag" or "keyboard-reorder")) throw new ArgumentException("Unsupported input action");
        var window = process.MainWindowHandle;
        if (window == 0 || !GetClientRect(window, out var rect)) throw new InvalidOperationException("Owned window unavailable");
        if (!(request.Width > 0 && request.Height > 0)) throw new ArgumentException("Invalid viewport dimensions");
        var origin = new Point(0, 0);
        if (!ClientToScreen(window, ref origin)) throw new InvalidOperationException("Cannot locate owned viewport");
        Point Position(double x, double y)
        {
            if (!(x >= 0 && x < request.Width && y >= 0 && y < request.Height)) throw new ArgumentException("Input must stay inside owned viewport");
            return new Point(origin.X + (int)Math.Round(x * rect.Right / request.Width), origin.Y + (int)Math.Round(y * rect.Bottom / request.Height));
        }
        var start = Position(request.X, request.Y);
        var end = Position(request.EndX, request.EndY);
        using var automation = new UIA3Automation();
        var element = automation.FromHandle(window);
        var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out _);
        var currentThread = GetCurrentThreadId();
        var attached = AttachThreadInput(currentThread, foregroundThread, true);
        try
        {
            if (GetForegroundWindow() != window)
            {
                element.SetForeground();
                element.FocusNative();
                SetForegroundWindow(window);
            }
        }
        finally { if (attached) AttachThreadInput(currentThread, foregroundThread, false); }
        Thread.Sleep(100);
        if (GetForegroundWindow() != window) throw new InvalidOperationException($"Owned E2E window must have focus: expected {window}, actual {GetForegroundWindow()}, title {process.MainWindowTitle}");
        Mouse.MoveTo(start);
        if (request.Action == "drag")
        {
            Mouse.Down(MouseButton.Left);
            try
            {
                Thread.Sleep(100);
                Mouse.MoveTo(end);
                Thread.Sleep(200);
            }
            finally { Mouse.Up(MouseButton.Left); }
        }
        else if (request.Action == "click") Mouse.Click(MouseButton.Left);
        else
        {
            // Scan codes preserve KeyboardEvent.code, which dnd-kit's keyboard sensor requires.
            foreach (var scanCode in new ushort[] { 0x39, 0x50, 0x50, 0x39 })
            {
                if (GetForegroundWindow() != window) throw new InvalidOperationException("Owned window lost focus during keyboard input");
                Keyboard.TypeScanCode(scanCode, scanCode == 0x50);
                Thread.Sleep(150);
            }
        }
        Console.WriteLine(JsonSerializer.Serialize(new { processId = process.Id, request.Action, start, end }));
    }
}

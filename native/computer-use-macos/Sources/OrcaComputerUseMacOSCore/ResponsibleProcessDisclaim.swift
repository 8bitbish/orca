import Darwin
import Foundation

/// Makes the helper its own TCC responsible process when Orca spawns it directly.
public enum ResponsibleProcessDisclaim {
    public static let environmentKey = "ORCA_COMPUTER_USE_RESPONSIBILITY_DISCLAIMED"

    private typealias SetDisclaim = @convention(c) (UnsafeMutablePointer<posix_spawnattr_t?>, Int32) -> Int32

    /// Re-execs in place (same pid) so Accessibility checks this bundle's grant, not Orca's; returns only on failure.
    public static func reexecIfNeeded() {
        guard getenv(environmentKey) == nil,
              let handle = dlopen(nil, RTLD_NOW),
              let symbol = dlsym(handle, "responsibility_spawnattrs_setdisclaim"),
              let executablePath = Bundle.main.executablePath else {
            return
        }
        let setDisclaim = unsafeBitCast(symbol, to: SetDisclaim.self)
        var attributes: posix_spawnattr_t?
        guard posix_spawnattr_init(&attributes) == 0 else { return }
        defer { posix_spawnattr_destroy(&attributes) }
        guard setDisclaim(&attributes, 1) == 0,
              posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETEXEC)) == 0 else {
            return
        }
        setenv(environmentKey, "1", 1)
        var pid: pid_t = 0
        let result = posix_spawn(&pid, executablePath, nil, &attributes, CommandLine.unsafeArgv, environ)
        unsetenv(environmentKey)
        fputs("orca-computer-use-macos: responsibility disclaim re-exec failed (\(result))\n", stderr)
    }
}

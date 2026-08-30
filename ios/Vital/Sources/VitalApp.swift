import SwiftUI
import BackgroundTasks

/// Vital — reads Apple Health on this phone and sends it to our own server.
/// Named by Tim. Apple Health never uploads anything itself; this app is the
/// only bridge, and the data goes only to our server.
///
/// Data freshness, two layers:
///  1. Guaranteed: every time the app opens, it auto-sends if the last send
///     is older than a few hours (see ContentView / SyncEngine).
///  2. Bonus: a background refresh task asks iOS to wake the app between
///     opens. iOS decides the actual timing (typically a few times a day),
///     so this is best-effort by design — Apple's rules, not ours.
@main
struct VitalApp: App {
    @Environment(\.scenePhase) private var scenePhase

    static let refreshTaskID = "app.vital.refresh"

    init() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshTaskID, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Self.handleRefresh(refresh)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background { Self.scheduleRefresh() }
        }
    }

    static func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: SyncEngine.autoSyncInterval)
        try? BGTaskScheduler.shared.submit(request) // duplicate submissions are fine to ignore
    }

    private static func handleRefresh(_ task: BGAppRefreshTask) {
        scheduleRefresh() // keep the chain going for next time
        let work = Task {
            _ = await SyncEngine.sync(days: 7)
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}

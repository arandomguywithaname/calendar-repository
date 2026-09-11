import SwiftUI
import BackgroundTasks
import Foundation

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
///  3. Bonus: HealthKit wakes the app itself when a watch writes something
///     new (see HealthObserver), which usually beats both of the above.
@main
struct VitalApp: App {
    static let refreshTaskID = "app.vital.refresh"

    init() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshTaskID, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Self.handleRefresh(refresh)
        }
        // Registered here rather than on first screen: iOS launches the app in
        // the background to deliver a HealthKit update, and the observer has to
        // already exist at that moment or the delivery is dropped. init() runs
        // on those launches; a view's onAppear does not.
        HealthObserver.start()
    }

    // Note: scene-phase watching lives in ContentView (View.onChange), because
    // Scene.onChange only exists on iOS 17+ and Vital targets iOS 16.
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }

    static func scheduleRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: SyncEngine.autoSyncInterval)
        try? BGTaskScheduler.shared.submit(request) // duplicate submissions are fine to ignore
    }

    /// setTaskCompleted must be called exactly once. iOS can fire the expiration
    /// handler while the sync is still in flight, and calling it twice is an API
    /// misuse that kills the app — so whichever arrives first wins.
    private final class Once {
        private let lock = NSLock()
        private var used = false
        func claim() -> Bool {
            lock.lock()
            defer { lock.unlock() }
            if used { return false }
            used = true
            return true
        }
    }

    private static func handleRefresh(_ task: BGAppRefreshTask) {
        scheduleRefresh() // keep the chain going for next time
        let finish = Once()
        let work = Task {
            _ = await SyncEngine.sync(days: 7)
            if finish.claim() { task.setTaskCompleted(success: true) }
        }
        task.expirationHandler = {
            work.cancel()
            if finish.claim() { task.setTaskCompleted(success: false) }
        }
    }
}

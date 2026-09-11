import Foundation
import HealthKit

/// Lets Apple Health wake Vital when there is something new to send.
///
/// The background refresh task in `VitalApp` asks iOS for a turn every few
/// hours and iOS grants it when it feels like it. This is the other direction:
/// HealthKit itself launches the app the moment a watch writes a night of
/// sleep, so the data is on the server before anyone asks for it rather than
/// whenever the app is next opened.
///
/// Three things all have to be true or nothing is delivered, silently:
///   1. the `com.apple.developer.healthkit.background-delivery` entitlement
///      (see project.yml) — without it this all reports success and never fires
///   2. an observer registered at launch, before HealthKit tries to deliver
///   3. `completionHandler()` called every time — miss it and iOS stops asking
enum HealthObserver {

    /// How much history each wake-up re-reads. Not one day: a watch syncs a
    /// night to the phone hours after it ended, and a sample can land against
    /// yesterday's date. Three days is enough to catch late arrivals and still
    /// cheap enough for the seconds of runtime a background wake-up gets.
    static let wakeWindowDays = 3

    /// Worth being woken for. Deliberately not every type Vital reads —
    /// heart rate alone would fire continuously all day, spend the background
    /// budget, and deliver nothing that isn't caught by the next wake-up.
    private static var watched: [HKSampleType] {
        [
            HKCategoryType(.sleepAnalysis),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.activeEnergyBurned),
            HKObjectType.workoutType(),
        ]
    }

    private static let store = HKHealthStore()
    private static var queries: [HKObserverQuery] = []
    private static let gate = SyncGate()

    /// Call once per launch, as early as possible — including the launches iOS
    /// performs in the background specifically to deliver an update.
    static func start() {
        guard HKHealthStore.isHealthDataAvailable(), queries.isEmpty else { return }

        for type in watched {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completionHandler, error in
                // Even on error: iOS reads a missing completionHandler as the
                // app having failed to cope, and stops delivering to it.
                if error != nil {
                    completionHandler()
                    return
                }
                Task {
                    await gate.sync()
                    completionHandler()
                }
            }
            store.execute(query)
            queries.append(query)
            // .immediate is a ceiling, not a schedule. iOS batches by battery,
            // by how much background time the app has earned, and by what else
            // is competing — so this is "as soon as iOS is willing", not "now".
            store.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
        }
    }
}

/// Five watched types can all report new samples within the same second — the
/// end of a workout writes energy, heart rate and the workout itself at once.
/// Without this each wake-up would start its own read-and-upload, and they
/// would race each other for the same few seconds of background time. The
/// first one runs; the rest wait for it and report the same result.
private actor SyncGate {
    private var running: Task<Void, Never>?

    func sync() async {
        if let running {
            await running.value
            return
        }
        let task = Task { _ = await SyncEngine.sync(days: HealthObserver.wakeWindowDays) }
        running = task
        await task.value
        running = nil
    }
}

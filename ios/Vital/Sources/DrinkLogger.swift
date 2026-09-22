import Foundation
import HealthKit

/// Records a drink in Apple Health the moment someone has one.
///
/// This is the only thing Vital writes. Every other line of the app reads and
/// only reads — see HealthKitReader, which still passes an empty share set.
///
/// Writing to Apple Health rather than keeping a private tally is the whole
/// point. The figure then lives where the rest of the health data lives: it
/// shows up in the Health app next to everything else, it survives Vital being
/// deleted or reinstalled, other apps can see it, and — not least — it comes
/// back through the reader that already exists, so a drink reaches the server
/// through the same path as a night's sleep with no change to the payload, the
/// ingest or the server at all.
enum DrinkLogger {

    private static let store = HKHealthStore()
    private static let type = HKQuantityType(.numberOfAlcoholicBeverages)

    /// One tap is one standard drink. That is the unit HealthKit counts in and
    /// the one the Health app shows, so a glass of champagne is 1 — not a
    /// measure of how full the glass was.
    private static let oneDrink = HKQuantity(unit: .count(), doubleValue: 1)

    enum LogError: LocalizedError {
        case unavailable
        case denied

        var errorDescription: String? {
            switch self {
            case .unavailable:
                return "Apple Health isn't available on this phone."
            case .denied:
                return "Vital isn't allowed to add drinks to Apple Health. Turn it on in "
                    + "Settings → Health → Data Access & Devices → Vital → Alcohol Consumption."
            }
        }
    }

    /// Whether the write has been refused.
    ///
    /// Worth checking, because this is the one permission in the app that can
    /// be checked. HealthKit hides a refused *read* on purpose — it reports no
    /// error and simply returns nothing, which is why a missing metric
    /// elsewhere is silent. A refused write is visible, so this button can say
    /// what is wrong instead of looking like it worked.
    static var isDenied: Bool {
        store.authorizationStatus(for: type) == .sharingDenied
    }

    /// Writes one drink, timestamped now, and hands back the sample so it can
    /// be taken away again.
    @discardableResult
    static func log(at date: Date = Date()) async throws -> HKQuantitySample {
        guard HKHealthStore.isHealthDataAvailable() else { throw LogError.unavailable }
        try await store.requestAuthorization(toShare: [type], read: [])
        guard !isDenied else { throw LogError.denied }

        let sample = HKQuantitySample(type: type, quantity: oneDrink, start: date, end: date)
        try await store.save(sample)
        return sample
    }

    /// Takes one back.
    ///
    /// Not a nicety: one tap writes to a permanent health record, the button
    /// sits next to the one that sends everything, and a phone in a pocket
    /// presses things. Undo has to be there from the first version.
    static func undo(_ sample: HKQuantitySample) async throws {
        try await store.delete(sample)
    }
}

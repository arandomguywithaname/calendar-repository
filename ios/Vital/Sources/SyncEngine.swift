import Foundation
import HealthKit

/// One place that performs a sync, whoever asks: the big button, the
/// automatic on-open refresh, or the background task.
enum SyncEngine {
    static let reader = HealthKitReader()

    /// How stale the data has to be before an automatic sync is worth doing.
    /// Also what the background task asks iOS for. Two hours: often enough
    /// that a night's sleep is on the server by breakfast, rare enough that
    /// iOS keeps granting the wake-ups.
    static let autoSyncInterval: TimeInterval = 2 * 3600

    static var isDue: Bool {
        guard Uploader.isConfigured else { return false }
        guard let last = Uploader.lastSync else { return true }
        return Date().timeIntervalSince(last) > autoSyncInterval
    }

    /// Reads the last `days` days from Apple Health and sends them.
    /// Safe to call repeatedly — the server overwrites days, never duplicates.
    ///
    /// `allowBackfill` is off by default on purpose. It can read a whole
    /// timeline, which is fine while someone is watching a spinner and fatal in
    /// a background wake-up, where iOS grants seconds and kills whatever
    /// overruns. Only the foreground paths pass true.
    @discardableResult
    static func sync(days: Int = 7, allowBackfill: Bool = false) async -> Uploader.Result {
        guard Uploader.isConfigured else {
            return Uploader.Result(ok: false, message: "Paste the family connection link first (gear button).")
        }
        do {
            try await reader.requestPermission()
            let payload = try await reader.buildPayload(days: days)
            guard !Payload.isEmpty(payload) else {
                return record("No Health data came back. Open Settings → Health → Data Access "
                    + "& Devices → Vital and switch on what you're happy to share.")
            }
            let result = await Uploader.send(payload: payload)
            if result.ok, allowBackfill { await backfillNewMetrics() }
            return result
        } catch let error as NSError where error.domain == HKError.errorDomain
            && error.code == HKError.errorDatabaseInaccessible.rawValue {
            // Not a fault, and nothing the person can act on: HealthKit is
            // encrypted and stops being readable about ten minutes after the
            // phone locks, until the next unlock. Background refresh lands in
            // that window routinely. Leave the last real result on screen
            // instead of replacing it with an error about a locked phone.
            return Uploader.Result(
                ok: false,
                message: "Phone was locked, so Health data was sealed. Will try again later."
            )
        } catch {
            return record("Health access problem: \(error.localizedDescription)")
        }
    }

    /// Sends the whole history of any metric this build reads but has never sent.
    ///
    /// An update that teaches Vital to read something new would otherwise leave
    /// it permanently thin: a routine sync covers a week, so the server ends up
    /// with twelve years of steps and seven days of body mass, and nothing ever
    /// closes the gap. Nothing errors — someone simply has to know to press
    /// "All". This is that press, made automatic and made once.
    ///
    /// A year at a time. The whole timeline in one request is megabytes, which
    /// is a long upload to lose to a timeout on a train; a year is small, and
    /// the server overwrites days, so a run that dies halfway is picked up by
    /// the next one with nothing duplicated and nothing lost.
    private static func backfillNewMetrics() async {
        let owed = reader.knownMetricNames.subtracting(Uploader.backfilledMetrics)
        guard !owed.isEmpty else { return }

        // Resume only a run that was for exactly this set of metrics; anything
        // else would skip the early years of whatever is newly owed.
        var cursor = (Uploader.backfillOwed == owed ? Uploader.backfillCursor : nil) ?? reader.earliestDate
        Uploader.backfillOwed = owed

        let calendar = Calendar.current
        let now = Date()
        while cursor < now {
            let next = min(calendar.date(byAdding: .year, value: 1, to: cursor) ?? now, now)
            do {
                let payload = try await reader.buildBackfill(names: owed, from: cursor, to: next)
                // An empty year is normal — nobody has data for all twelve.
                if !Payload.isEmpty(payload) {
                    let sent = await Uploader.send(payload: payload)
                    guard sent.ok else { return }
                }
            } catch {
                // Still owed, and the cursor stands: the next foreground sync
                // carries on from this year rather than from 2014.
                return
            }
            cursor = next
            Uploader.backfillCursor = cursor
        }

        // Settled — including when every year came back empty. Without recording
        // that, a phone with no history for these types would re-read its entire
        // timeline on every single sync, forever.
        Uploader.backfilledMetrics.formUnion(owed)
        Uploader.backfillCursor = nil
        Uploader.backfillOwed = []
    }

    /// Remembers a failure so the main screen shows it after the app is reopened.
    private static func record(_ message: String) -> Uploader.Result {
        Uploader.lastSync = Date()
        Uploader.lastOK = false
        Uploader.lastMessage = message
        return Uploader.Result(ok: false, message: message)
    }
}

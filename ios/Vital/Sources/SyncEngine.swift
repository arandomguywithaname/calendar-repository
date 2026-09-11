import Foundation
import HealthKit

/// One place that performs a sync, whoever asks: the big button, the
/// automatic on-open refresh, or the background task.
enum SyncEngine {
    static let reader = HealthKitReader()

    /// Auto-sync policy: worth syncing if configured and the last send is
    /// older than this. Keeps app-open refreshes from spamming the server.
    static let autoSyncInterval: TimeInterval = 4 * 3600

    static var isDue: Bool {
        guard Uploader.isConfigured else { return false }
        guard let last = Uploader.lastSync else { return true }
        return Date().timeIntervalSince(last) > autoSyncInterval
    }

    /// Reads the last `days` days from Apple Health and sends them.
    /// Safe to call repeatedly — the server overwrites days, never duplicates.
    @discardableResult
    static func sync(days: Int = 7) async -> Uploader.Result {
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
            return await Uploader.send(payload: payload)
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

    /// Remembers a failure so the main screen shows it after the app is reopened.
    private static func record(_ message: String) -> Uploader.Result {
        Uploader.lastSync = Date()
        Uploader.lastOK = false
        Uploader.lastMessage = message
        return Uploader.Result(ok: false, message: message)
    }
}

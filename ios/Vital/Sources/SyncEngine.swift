import Foundation

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
            return await Uploader.send(payload: payload)
        } catch {
            let result = Uploader.Result(ok: false, message: "Health access problem: \(error.localizedDescription)")
            Uploader.lastSync = Date()
            Uploader.lastOK = false
            Uploader.lastMessage = result.message
            return result
        }
    }
}

import Foundation

/// Builds the JSON the server's /api/health/ingest endpoint understands
/// (documented in APPLE_HEALTH.md §2b). Rows are heterogeneous — plain
/// dictionaries + JSONSerialization keep this simple and readable.
enum Payload {

    /// Server-contract date format: device-local "yyyy-MM-dd HH:mm:ss Z".
    static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss Z"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        return f
    }()

    static func date(_ d: Date) -> String { dateFormatter.string(from: d) }

    /// One metric block: { name, units, data: [rows] }.
    ///
    /// `source` is the bundle identifier of the device this metric was taken
    /// from, and is set only where Vital deliberately chose one device over
    /// another (sleep, HRV). A metric aggregated by HealthKit across every
    /// source has no single answer and leaves it off rather than naming one
    /// arbitrarily.
    static func metric(name: String, units: String, rows: [[String: Any]],
                       source: String? = nil) -> [String: Any] {
        var block: [String: Any] = ["name": name, "units": units, "data": rows]
        if let source { block["source"] = source }
        return block
    }

    /// Wraps everything into the top-level body.
    static func body(metrics: [[String: Any]], workouts: [[String: Any]]) -> [String: Any] {
        ["data": ["metrics": metrics, "workouts": workouts]]
    }

    /// True when Health handed back nothing at all. That is exactly what a
    /// declined permission looks like: HealthKit deliberately reports no error
    /// for it, so an empty payload is the only signal the app ever gets.
    static func isEmpty(_ body: [String: Any]) -> Bool {
        guard let data = body["data"] as? [String: Any] else { return true }
        let metrics = (data["metrics"] as? [[String: Any]]) ?? []
        let workouts = (data["workouts"] as? [[String: Any]]) ?? []
        return metrics.isEmpty && workouts.isEmpty
    }

    static func encode(_ dictionary: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: dictionary, options: [])
    }
}

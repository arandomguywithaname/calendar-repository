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
    static func metric(name: String, units: String, rows: [[String: Any]]) -> [String: Any] {
        ["name": name, "units": units, "data": rows]
    }

    /// Wraps everything into the top-level body.
    static func body(metrics: [[String: Any]], workouts: [[String: Any]]) -> [String: Any] {
        ["data": ["metrics": metrics, "workouts": workouts]]
    }

    static func encode(_ dictionary: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: dictionary, options: [])
    }
}

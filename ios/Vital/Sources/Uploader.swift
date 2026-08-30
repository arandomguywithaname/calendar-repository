import Foundation

/// Sends the payload to our server and remembers how it went, so the main
/// screen can show "last sent / success or error" (Tim's screen spec).
enum Uploader {

    struct Result {
        let ok: Bool
        let message: String
    }

    static var serverURL: String {
        get { UserDefaults.standard.string(forKey: "serverURL") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "serverURL") }
    }

    static var lastSync: Date? {
        get { UserDefaults.standard.object(forKey: "lastSync") as? Date }
        set { UserDefaults.standard.set(newValue, forKey: "lastSync") }
    }

    static var lastMessage: String {
        get { UserDefaults.standard.string(forKey: "lastMessage") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "lastMessage") }
    }

    static var lastOK: Bool {
        get { UserDefaults.standard.bool(forKey: "lastOK") }
        set { UserDefaults.standard.set(newValue, forKey: "lastOK") }
    }

    static var isConfigured: Bool {
        !serverURL.isEmpty && KeychainHelper.load()?.isEmpty == false
    }

    private static func endpoint(_ path: String) -> URL? {
        var base = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while base.hasSuffix("/") { base.removeLast() }
        if !base.lowercased().hasPrefix("http") { base = "https://" + base }
        return URL(string: base + path)
    }

    /// POST the health payload. Returns a human-readable result and records
    /// it for the main screen.
    static func send(payload: [String: Any]) async -> Result {
        guard let url = endpoint("/api/health/ingest"), let token = KeychainHelper.load() else {
            return remember(Result(ok: false, message: "Not set up yet — open Settings."))
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.httpBody = try Payload.encode(payload)
            request.timeoutInterval = 60

            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]

            if status == 200, reply?["ok"] as? Bool == true {
                let points = reply?["dataPoints"] as? Int ?? 0
                let days = reply?["daysTouched"] as? Int ?? 0
                return remember(Result(ok: true, message: "Sent \(points) data points across \(days) day(s)."))
            }
            let serverError = reply?["error"] as? String ?? "server answered \(status)"
            return remember(Result(ok: false, message: "Failed: \(serverError)"))
        } catch {
            return remember(Result(ok: false, message: "Failed: \(error.localizedDescription)"))
        }
    }

    /// GET /api/health/status — used by the Settings "test connection" button.
    static func testConnection(urlString: String) async -> Result {
        let saved = serverURL
        serverURL = urlString
        defer { serverURL = saved }
        guard let url = endpoint("/api/health/status") else {
            return Result(ok: false, message: "That doesn't look like a URL.")
        }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200,
                  let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let days = reply["daysStored"] as? Int else {
                return Result(ok: false, message: "Reached the address, but it doesn't look like our server (\(status)).")
            }
            return Result(ok: true, message: "Server found! It has \(days) day(s) of data so far.")
        } catch {
            return Result(ok: false, message: "Couldn't reach it: \(error.localizedDescription)")
        }
    }

    private static func remember(_ result: Result) -> Result {
        lastSync = Date()
        lastMessage = result.message
        lastOK = result.ok
        return result
    }
}

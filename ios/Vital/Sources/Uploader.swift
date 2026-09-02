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

    /// The one thing a person configures: "https://host/ingest/<secret>".
    static var connectionLink: String {
        guard !serverURL.isEmpty, let token = KeychainHelper.load(), !token.isEmpty else { return "" }
        return serverURL + "/ingest/" + token
    }

    /// The person's Claude connector link, remembered so Settings can re-show
    /// it whenever they're ready to paste it into claude.ai.
    static var connectorLink: String {
        get { UserDefaults.standard.string(forKey: "connectorLink") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "connectorLink") }
    }

    struct JoinOutcome {
        let ok: Bool
        let message: String
    }

    /// In-app signup: asks the server's /api/join for personal links and
    /// configures this install with them. Server address only — no secrets needed.
    static func join(server: String, name: String) async -> JoinOutcome {
        var base = server.trimmingCharacters(in: .whitespacesAndNewlines)
        while base.hasSuffix("/") { base.removeLast() }
        if !base.lowercased().hasPrefix("http") { base = "https://" + base }
        guard let url = URL(string: base + "/api/join") else {
            return JoinOutcome(ok: false, message: "That doesn't look like a server address.")
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["name": name])
            request.timeoutInterval = 30
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            guard status == 200,
                  let sendLink = reply?["sendLink"] as? String,
                  let connector = reply?["connectorLink"] as? String else {
                let serverError = reply?["error"] as? String ?? "the server answered \(status)"
                return JoinOutcome(ok: false, message: "Couldn't join: \(serverError)")
            }
            guard applyConnectionLink(sendLink) else {
                return JoinOutcome(ok: false, message: "Couldn't join: the server sent a link this app didn't understand.")
            }
            connectorLink = connector
            let who = reply?["name"] as? String ?? name
            return JoinOutcome(ok: true, message: "Welcome, \(who)!")
        } catch {
            return JoinOutcome(ok: false, message: "Couldn't reach the server: \(error.localizedDescription)")
        }
    }

    /// Parses a connection link and stores server + secret. False = not a valid link.
    ///
    /// Two shapes are valid, and both end up as "everything after /ingest/":
    ///   • the shared family link   /ingest/<secret>
    ///   • a personal link          /ingest/<name>/<signature>
    /// Personal links are what the Join button and `npm run user` hand out, so
    /// this must accept the longer shape or multi-user setup can never work.
    static func applyConnectionLink(_ raw: String) -> Bool {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.lowercased().hasPrefix("http") { text = "https://" + text }
        guard let url = URL(string: text), let host = url.host else { return false }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count == 2 || parts.count == 3, parts[0] == "ingest" else { return false }
        let secret = parts.dropFirst().joined(separator: "/")
        guard secret.count >= 8 else { return false }
        var base = (url.scheme ?? "https") + "://" + host
        if let port = url.port { base += ":\(port)" }
        serverURL = base
        KeychainHelper.save(secret)
        return true
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
        guard let token = KeychainHelper.load(), !token.isEmpty, let url = endpoint("/ingest/\(token)") else {
            return remember(Result(ok: false, message: "Not set up yet — open Settings and paste the connection link."))
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
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

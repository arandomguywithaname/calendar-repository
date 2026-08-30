import SwiftUI

/// Vital — reads Apple Health on this phone and sends it to our own server.
/// Named by Tim. Apple Health never uploads anything itself; this app is the
/// only bridge, and the data goes only to our server.
@main
struct VitalApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

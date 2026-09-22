import SwiftUI
import HealthKit

/// Vital's main screen — Tim's design: when data was last sent,
/// whether it worked, and one big "Send now" button.
/// Data also refreshes itself: automatically whenever the app opens
/// (if the last send is a few hours old), and via background refresh.
struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var sending = false
    @State private var lastSync = Uploader.lastSync
    @State private var lastMessage = Uploader.lastMessage
    @State private var lastOK = Uploader.lastOK
    @State private var days = 7
    @State private var showSettings = false
    @State private var showJoin = false
    @State private var loggingDrink = false
    @State private var drinkMessage = ""
    /// The last drink written, kept only so it can be taken back.
    @State private var lastDrink: HKQuantitySample?

    /// "All" in days: HealthKit shipped with iOS 8 in September 2014, so nothing
    /// can exist before that and counting from there really is everything.
    private var allDays: Int {
        var start = DateComponents()
        start.year = 2014
        start.month = 9
        start.day = 1
        let calendar = Calendar.current
        guard let from = calendar.date(from: start),
              let days = calendar.dateComponents([.day], from: from, to: Date()).day else { return 4000 }
        return max(90, days)
    }

    /// Public server address baked into the build — enables in-app signup.
    private var bakedServer: String {
        (Bundle.main.object(forInfoDictionaryKey: "VitalServerURL") as? String) ?? ""
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()

                Image(systemName: "heart.circle.fill")
                    .font(.system(size: 88))
                    .foregroundStyle(.pink)

                VStack(spacing: 6) {
                    if let lastSync {
                        Label {
                            Text("Last sent \(lastSync.formatted(.relative(presentation: .named)))")
                        } icon: {
                            Image(systemName: lastOK ? "checkmark.circle.fill" : "xmark.octagon.fill")
                                .foregroundStyle(lastOK ? .green : .red)
                        }
                        .font(.headline)
                        if !lastMessage.isEmpty {
                            Text(lastMessage)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                    } else {
                        Text("Nothing sent yet")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                Picker("How many days", selection: $days) {
                    Text("7").tag(7)
                    Text("30").tag(30)
                    Text("90").tag(90)
                    Text("All").tag(allDays)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 40)

                if days == allDays {
                    Text("Everything Apple Health has — years of it. Expect this one to take a minute.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                Button(action: { startSync(days: days, manual: true) }) {
                    HStack {
                        if sending {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "paperplane.fill")
                        }
                        Text(sending ? "Sending…" : "Send now")
                            .fontWeight(.bold)
                    }
                    .font(.title2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                }
                .buttonStyle(.borderedProminent)
                .tint(.pink)
                .disabled(sending)
                .padding(.horizontal, 32)

                // One tap, one drink, written to Apple Health there and then.
                // Deliberately quieter than Send now — it is used far more
                // often but matters far less if it is missed.
                VStack(spacing: 6) {
                    Button(action: logDrink) {
                        HStack {
                            if loggingDrink {
                                ProgressView()
                            } else {
                                Image(systemName: "wineglass")
                            }
                            Text("Had a drink")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.bordered)
                    .tint(.purple)
                    .disabled(loggingDrink)
                    .padding(.horizontal, 32)

                    if !drinkMessage.isEmpty {
                        HStack(spacing: 14) {
                            Text(drinkMessage)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            if lastDrink != nil {
                                Button("Undo", action: undoDrink)
                                    .font(.footnote.weight(.semibold))
                            }
                        }
                        .padding(.horizontal, 32)
                    }
                }

                Spacer()

                Text("Vital reads Apple Health on this phone and sends it only to our own server. It updates automatically when you open the app.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 8)
            }
            .navigationTitle("Vital")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showSettings, onDismiss: { afterSetup() }) {
                SettingsView()
            }
            .sheet(isPresented: $showJoin, onDismiss: { afterSetup() }) {
                JoinView(server: bakedServer)
            }
            .onAppear {
                applyBakedInLinkIfNeeded()
                if !Uploader.isConfigured && !bakedServer.isEmpty {
                    showJoin = true // first run: sign up right in the app
                } else {
                    autoSyncIfDue()
                }
            }
            .onChange(of: scenePhase) { phase in
                if phase == .active { autoSyncIfDue() }
                if phase == .background { VitalApp.scheduleRefresh() }
            }
        }
    }

    /// Zero-config install: if the family's connection link was baked into the
    /// build (VitalDefaultConnectionLink in Info.plist), apply it on first run
    /// so a user only installs, allows Health access, and taps Send.
    private func applyBakedInLinkIfNeeded() {
        guard !Uploader.isConfigured,
              let link = Bundle.main.object(forInfoDictionaryKey: "VitalDefaultConnectionLink") as? String,
              !link.isEmpty else { return }
        _ = Uploader.applyConnectionLink(link)
    }

    /// A sheet just closed, so setup may have finished (Join or Settings).
    /// Pick up whatever it stored and send right away — a new person should
    /// never have to press anything to see their first data arrive.
    private func afterSetup() {
        lastSync = Uploader.lastSync
        lastMessage = Uploader.lastMessage
        lastOK = Uploader.lastOK
        // Connecting is the moment the automatic side has to start, and both
        // halves of it need arming here. The background refresh was previously
        // only requested when the app was next backgrounded; and HealthKit
        // background delivery asked for at launch was refused, because nobody
        // had granted Health access yet — that happens during this first sync.
        // Without these two lines, "connect once and forget" quietly wasn't.
        VitalApp.scheduleRefresh()
        HealthObserver.start()
        autoSyncIfDue()
    }

    /// The automatic refresh: fires on open/foreground, but only when the
    /// last send is old enough (SyncEngine decides) — never spams.
    private func autoSyncIfDue() {
        guard !sending, SyncEngine.isDue else { return }
        // The very first send seeds history so Claude has a baseline to compare
        // against from day one; after that a week keeps everything current.
        startSync(days: Uploader.lastSync == nil ? 90 : 7, manual: false)
    }

    /// Writes one drink to Apple Health, then sends it on.
    ///
    /// The send is immediate rather than left to the next window: the point of
    /// the button is that the drink is written down, and "it will turn up in a
    /// couple of hours" is not what pressing a button feels like it promised.
    private func logDrink() {
        guard !loggingDrink else { return }
        loggingDrink = true
        drinkMessage = ""
        Task {
            do {
                let sample = try await DrinkLogger.log()
                lastDrink = sample
                drinkMessage = "Drink recorded."
                loggingDrink = false
                // Only worth a sync if there is somewhere to send it; the write
                // to Health has already happened either way.
                if Uploader.isConfigured {
                    let result = await SyncEngine.sync(days: 2)
                    lastOK = result.ok
                    lastMessage = result.message
                    lastSync = Uploader.lastSync
                }
            } catch {
                drinkMessage = error.localizedDescription
                loggingDrink = false
            }
        }
    }

    private func undoDrink() {
        guard let sample = lastDrink else { return }
        lastDrink = nil
        Task {
            do {
                try await DrinkLogger.undo(sample)
                drinkMessage = "Removed."
                // Re-send so the server forgets it too — it overwrites days, so
                // the drink simply stops being there.
                if Uploader.isConfigured {
                    let result = await SyncEngine.sync(days: 2)
                    lastOK = result.ok
                    lastMessage = result.message
                    lastSync = Uploader.lastSync
                }
            } catch {
                drinkMessage = "Couldn't remove it: \(error.localizedDescription)"
            }
        }
    }

    private func startSync(days: Int, manual: Bool) {
        if manual, !Uploader.isConfigured {
            if !bakedServer.isEmpty {
                showJoin = true // one tap signs them up right here
            } else {
                lastOK = false
                lastMessage = "Paste the family connection link first (gear button)."
                showSettings = true
            }
            return
        }
        guard !sending else { return }
        sending = true
        Task {
            // Foreground: a spinner is on screen and there is time, so this is
            // where history for newly-read metrics is allowed to be filled in.
            let result = await SyncEngine.sync(days: days, allowBackfill: true)
            lastOK = result.ok
            lastMessage = result.message
            lastSync = Uploader.lastSync
            sending = false
        }
    }
}

#Preview {
    ContentView()
}

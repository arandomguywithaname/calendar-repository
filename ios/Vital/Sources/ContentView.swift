import SwiftUI

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
                    Text("7 days").tag(7)
                    Text("30 days").tag(30)
                    Text("90 days").tag(90)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 40)

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
            let result = await SyncEngine.sync(days: days)
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

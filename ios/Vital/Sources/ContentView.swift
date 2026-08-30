import SwiftUI

/// Vital's main screen — Tim's design: when data was last sent,
/// whether it worked, and one big "Send now" button.
struct ContentView: View {
    @State private var sending = false
    @State private var lastSync = Uploader.lastSync
    @State private var lastMessage = Uploader.lastMessage
    @State private var lastOK = Uploader.lastOK
    @State private var days = 7
    @State private var showSettings = false

    private let reader = HealthKitReader()

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

                Button(action: sendNow) {
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

                Text("Vital reads Apple Health on this phone and sends it only to our own server. Nowhere else.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 8)
            }
            .navigationTitle("Vital")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
        }
    }

    private func sendNow() {
        guard Uploader.isConfigured else {
            lastOK = false
            lastMessage = "Set the server address and secret key first (gear button)."
            showSettings = true
            return
        }
        sending = true
        Task {
            defer { sending = false }
            do {
                try await reader.requestPermission()
                let payload = try await reader.buildPayload(days: days)
                let result = await Uploader.send(payload: payload)
                lastOK = result.ok
                lastMessage = result.message
            } catch {
                lastOK = false
                lastMessage = "Health access problem: \(error.localizedDescription)"
                Uploader.lastOK = false
                Uploader.lastMessage = lastMessage
                Uploader.lastSync = Date()
            }
            lastSync = Uploader.lastSync
        }
    }
}

#Preview {
    ContentView()
}

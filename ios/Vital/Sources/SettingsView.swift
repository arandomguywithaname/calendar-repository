import SwiftUI
import UIKit

/// One-time setup, one field: paste the family's connection link
/// (`npm run link` on the computer prints it). The secret inside it goes to
/// the phone's Keychain, never into the code (project rule #2).
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var link = Uploader.connectionLink
    @State private var problem = ""
    @State private var testing = false
    @State private var testMessage = ""
    @State private var testOK = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://our-server.fly.dev/ingest/…", text: $link, axis: .vertical)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .lineLimit(3)
                } header: {
                    Text("Connection link")
                } footer: {
                    Text("Your personal link from Join, or the shared family link from `npm run link`. It contains the key, which is stored only in this phone's Keychain.")
                }
                if !problem.isEmpty {
                    Section {
                        Label(problem, systemImage: "xmark.octagon.fill")
                            .foregroundStyle(.red)
                            .font(.subheadline)
                    }
                }
                if !Uploader.connectorLink.isEmpty {
                    Section {
                        Text(Uploader.connectorLink)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                        Button("Copy Claude link") {
                            UIPasteboard.general.string = Uploader.connectorLink
                        }
                    } header: {
                        Text("Your Claude link")
                    } footer: {
                        Text("Paste it on claude.ai → Settings → Connectors → Add custom connector (name: Vital).")
                    }
                }
                Section {
                    Button(action: test) {
                        HStack {
                            if testing { ProgressView() }
                            Text(testing ? "Checking…" : "Test connection")
                        }
                    }
                    .disabled(testing || link.isEmpty)
                    if !testMessage.isEmpty {
                        Label(testMessage, systemImage: testOK ? "checkmark.circle.fill" : "xmark.octagon.fill")
                            .foregroundStyle(testOK ? .green : .red)
                            .font(.subheadline)
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if Uploader.applyConnectionLink(link) {
                            dismiss()
                        } else {
                            problem = "That doesn't look like a connection link — it should have /ingest/ and a long secret in it."
                        }
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func test() {
        guard Uploader.applyConnectionLink(link) else {
            problem = "That doesn't look like a connection link — it should have /ingest/ and a long secret in it."
            return
        }
        problem = ""
        testing = true
        testMessage = ""
        Task {
            let result = await Uploader.testConnection(urlString: Uploader.serverURL)
            testOK = result.ok
            testMessage = result.message
            testing = false
        }
    }
}

#Preview {
    SettingsView()
}

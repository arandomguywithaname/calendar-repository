import SwiftUI

/// One-time setup: the server address and the secret key. The key goes
/// into the Keychain, never into the code (project rule #2).
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var serverURL = Uploader.serverURL
    @State private var token = KeychainHelper.load() ?? ""
    @State private var testing = false
    @State private var testMessage = ""
    @State private var testOK = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Our server") {
                    TextField("https://your-app.fly.dev", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    SecureField("Secret key (HEALTH_INGEST_TOKEN)", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Secret key")
                } footer: {
                    Text("The same HEALTH_INGEST_TOKEN that lives on the server. It is stored in this phone's Keychain only.")
                }
                Section {
                    Button(action: test) {
                        HStack {
                            if testing { ProgressView() }
                            Text(testing ? "Checking…" : "Test connection")
                        }
                    }
                    .disabled(testing || serverURL.isEmpty)
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
                        Uploader.serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        KeychainHelper.save(token.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func test() {
        testing = true
        testMessage = ""
        Task {
            let result = await Uploader.testConnection(urlString: serverURL)
            testOK = result.ok
            testMessage = result.message
            testing = false
        }
    }
}

#Preview {
    SettingsView()
}

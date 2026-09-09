import SwiftUI
import UIKit

/// First-run signup from inside the app. Needs only the server's public
/// address (baked into the build as VitalServerURL — not a secret): one tap
/// asks the server's /api/join for personal links and configures this
/// install. The person's only remaining job is pasting their Claude link
/// into claude.ai.
struct JoinView: View {
    @Environment(\.dismiss) private var dismiss
    let server: String
    @State private var name = ""
    @State private var working = false
    @State private var message = ""
    @State private var joined = false

    var body: some View {
        NavigationStack {
            Form {
                if !joined {
                    Section {
                        TextField("Your first name (optional)", text: $name)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                    } footer: {
                        Text("One tap creates your personal, private space on this server. No account, no password. Your health data will be readable only through your own links.")
                    }
                    Section {
                        Button(action: join) {
                            HStack {
                                if working { ProgressView() }
                                Text(working ? "Joining…" : "Create my Vital")
                                    .fontWeight(.bold)
                            }
                        }
                        .disabled(working)
                        if !message.isEmpty {
                            Label(message, systemImage: "xmark.octagon.fill")
                                .foregroundStyle(.red)
                                .font(.subheadline)
                        }
                    }
                } else {
                    Section {
                        Label(message, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                    Section {
                        Text("Copy this link, then on claude.ai: Settings → Connectors → Add custom connector → name it Vital → paste the link. That's how your Claude gets to read your data — and only yours.")
                            .font(.subheadline)
                        Text(Uploader.connectorLink)
                            .font(.footnote.monospaced())
                            .textSelection(.enabled)
                        Button("Copy Claude link") {
                            UIPasteboard.general.string = Uploader.connectorLink
                        }
                    } header: {
                        Text("Last step — connect your Claude")
                    } footer: {
                        Text("This link is also kept in Settings, so you can copy it again anytime.")
                    }
                    Section {
                        Button("Done") { dismiss() }
                    }
                }
            }
            .navigationTitle("Join Vital")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    private func join() {
        working = true
        message = ""
        Task {
            let outcome = await Uploader.join(server: server, name: name)
            message = outcome.message
            joined = outcome.ok
            working = false
        }
    }
}

#Preview {
    JoinView(server: "https://example.fly.dev")
}

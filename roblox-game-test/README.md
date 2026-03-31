# Test Game - Roblox UI Test

A Roblox Studio game project for testing game UI elements.

## Project Structure

```
roblox-game-test/
├── default.project.json          # Rojo project config
├── src/
│   ├── ReplicatedStorage/
│   │   └── GameConfig.lua        # Shared game configuration
│   ├── ServerScriptService/
│   │   └── GameManager.server.lua # Server: leaderboard & player management
│   ├── StarterGui/
│   │   └── TestGameUI/
│   │       ├── init.meta.json    # ScreenGui metadata
│   │       ├── MainFrame.lua     # Main UI panel (health, score, inventory, actions)
│   │       └── HUDOverlay.lua    # HUD (minimap, notifications, FPS, crosshair)
│   └── StarterPlayer/
│       └── StarterPlayerScripts/
│           └── PlayerController.client.lua  # Client input handling
```

## UI Components

- **MainFrame** - Central game panel with:
  - Title bar with close button
  - Health bar (auto-drains for testing, heal to restore)
  - Score counter (increases on Attack)
  - 3x3 inventory grid with clickable slots
  - Action buttons: Attack, Defend, Heal

- **HUDOverlay** - Heads-up display with:
  - Minimap placeholder (top-right)
  - Notification feed (top-left, auto-fading)
  - FPS counter (bottom-left)
  - Crosshair (center)

## Controls

- **T** - Toggle the main UI panel
- **Mouse** - Click inventory slots and action buttons

## Setup

1. Install [Rojo](https://rojo.space/) (VS Code extension or CLI)
2. Run `rojo serve` in this directory
3. Connect from Roblox Studio via the Rojo plugin

-- GameManager: Server-side script that manages player connections,
-- leaderboard stats, and game state for the test game.

local Players = game:GetService("Players")

---------------------------------------------------------------------------
-- Leaderboard Setup
---------------------------------------------------------------------------
local function onPlayerAdded(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local score = Instance.new("IntValue")
	score.Name = "Score"
	score.Value = 0
	score.Parent = leaderstats

	local level = Instance.new("IntValue")
	level.Name = "Level"
	level.Value = 1
	level.Parent = leaderstats

	print("[GameManager] Player joined: " .. player.Name)
end

local function onPlayerRemoving(player)
	print("[GameManager] Player left: " .. player.Name)
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)

-- Handle players who joined before the script loaded
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

print("[GameManager] Server initialized!")

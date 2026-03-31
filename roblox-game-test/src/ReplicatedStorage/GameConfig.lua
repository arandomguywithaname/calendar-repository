-- GameConfig: Shared configuration module for the test game.

local GameConfig = {}

GameConfig.GameName = "Test Game"
GameConfig.Version = "1.0.0"

GameConfig.MaxHealth = 100
GameConfig.DamagePerTick = 5
GameConfig.DamageInterval = 3
GameConfig.HealAmount = 20
GameConfig.AttackScore = 10

GameConfig.UI = {
	MainFrameSize = UDim2.new(0.4, 0, 0.6, 0),
	PrimaryColor = Color3.fromRGB(25, 25, 35),
	AccentColor = Color3.fromRGB(35, 35, 50),
	HealthColorHigh = Color3.fromRGB(50, 200, 50),
	HealthColorMid = Color3.fromRGB(200, 200, 50),
	HealthColorLow = Color3.fromRGB(200, 50, 50),
}

return GameConfig

-- MainFrame: Creates the primary game UI frame with title bar, health bar,
-- score display, inventory grid, and action buttons.

local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

---------------------------------------------------------------------------
-- Helper: create an Instance with properties
---------------------------------------------------------------------------
local function create(className, properties)
	local inst = Instance.new(className)
	for k, v in pairs(properties) do
		if k ~= "Parent" then
			inst[k] = v
		end
	end
	if properties.Parent then
		inst.Parent = properties.Parent
	end
	return inst
end

---------------------------------------------------------------------------
-- ScreenGui (container)
---------------------------------------------------------------------------
local screenGui = create("ScreenGui", {
	Name = "TestGameUI",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = playerGui,
})

---------------------------------------------------------------------------
-- Main Frame
---------------------------------------------------------------------------
local mainFrame = create("Frame", {
	Name = "MainFrame",
	Size = UDim2.new(0.4, 0, 0.6, 0),
	Position = UDim2.new(0.3, 0, 0.2, 0),
	BackgroundColor3 = Color3.fromRGB(25, 25, 35),
	BorderSizePixel = 0,
	Parent = screenGui,
})

create("UICorner", { CornerRadius = UDim.new(0, 12), Parent = mainFrame })

---------------------------------------------------------------------------
-- Title Bar
---------------------------------------------------------------------------
local titleBar = create("Frame", {
	Name = "TitleBar",
	Size = UDim2.new(1, 0, 0, 48),
	BackgroundColor3 = Color3.fromRGB(35, 35, 50),
	BorderSizePixel = 0,
	Parent = mainFrame,
})

create("UICorner", { CornerRadius = UDim.new(0, 12), Parent = titleBar })

create("TextLabel", {
	Name = "TitleLabel",
	Size = UDim2.new(1, -20, 1, 0),
	Position = UDim2.new(0, 10, 0, 0),
	BackgroundTransparency = 1,
	Text = "TEST GAME",
	TextColor3 = Color3.fromRGB(255, 255, 255),
	TextSize = 22,
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = titleBar,
})

-- Close button
local closeBtn = create("TextButton", {
	Name = "CloseButton",
	Size = UDim2.new(0, 36, 0, 36),
	Position = UDim2.new(1, -42, 0, 6),
	BackgroundColor3 = Color3.fromRGB(200, 50, 50),
	Text = "X",
	TextColor3 = Color3.fromRGB(255, 255, 255),
	TextSize = 18,
	Font = Enum.Font.GothamBold,
	Parent = titleBar,
})

create("UICorner", { CornerRadius = UDim.new(0, 6), Parent = closeBtn })

closeBtn.MouseButton1Click:Connect(function()
	screenGui.Enabled = not screenGui.Enabled
end)

---------------------------------------------------------------------------
-- Health Bar Section
---------------------------------------------------------------------------
local healthSection = create("Frame", {
	Name = "HealthSection",
	Size = UDim2.new(1, -20, 0, 50),
	Position = UDim2.new(0, 10, 0, 58),
	BackgroundTransparency = 1,
	Parent = mainFrame,
})

create("TextLabel", {
	Name = "HealthLabel",
	Size = UDim2.new(0.3, 0, 1, 0),
	BackgroundTransparency = 1,
	Text = "HP",
	TextColor3 = Color3.fromRGB(200, 200, 200),
	TextSize = 16,
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = healthSection,
})

local healthBarBg = create("Frame", {
	Name = "HealthBarBackground",
	Size = UDim2.new(0.7, 0, 0.5, 0),
	Position = UDim2.new(0.3, 0, 0.25, 0),
	BackgroundColor3 = Color3.fromRGB(60, 60, 60),
	BorderSizePixel = 0,
	Parent = healthSection,
})

create("UICorner", { CornerRadius = UDim.new(0, 8), Parent = healthBarBg })

local healthBarFill = create("Frame", {
	Name = "HealthBarFill",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundColor3 = Color3.fromRGB(50, 200, 50),
	BorderSizePixel = 0,
	Parent = healthBarBg,
})

create("UICorner", { CornerRadius = UDim.new(0, 8), Parent = healthBarFill })

local healthText = create("TextLabel", {
	Name = "HealthText",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1,
	Text = "100 / 100",
	TextColor3 = Color3.fromRGB(255, 255, 255),
	TextSize = 14,
	Font = Enum.Font.GothamBold,
	Parent = healthBarBg,
})

---------------------------------------------------------------------------
-- Score Display
---------------------------------------------------------------------------
local scoreFrame = create("Frame", {
	Name = "ScoreFrame",
	Size = UDim2.new(1, -20, 0, 40),
	Position = UDim2.new(0, 10, 0, 118),
	BackgroundTransparency = 1,
	Parent = mainFrame,
})

create("TextLabel", {
	Name = "ScoreLabel",
	Size = UDim2.new(0.5, 0, 1, 0),
	BackgroundTransparency = 1,
	Text = "Score:",
	TextColor3 = Color3.fromRGB(200, 200, 200),
	TextSize = 18,
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = scoreFrame,
})

local scoreValue = create("TextLabel", {
	Name = "ScoreValue",
	Size = UDim2.new(0.5, 0, 1, 0),
	Position = UDim2.new(0.5, 0, 0, 0),
	BackgroundTransparency = 1,
	Text = "0",
	TextColor3 = Color3.fromRGB(255, 215, 0),
	TextSize = 24,
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Right,
	Parent = scoreFrame,
})

---------------------------------------------------------------------------
-- Inventory Grid (3x3)
---------------------------------------------------------------------------
local inventoryFrame = create("Frame", {
	Name = "InventoryGrid",
	Size = UDim2.new(1, -20, 0, 160),
	Position = UDim2.new(0, 10, 0, 168),
	BackgroundColor3 = Color3.fromRGB(35, 35, 50),
	BorderSizePixel = 0,
	Parent = mainFrame,
})

create("UICorner", { CornerRadius = UDim.new(0, 8), Parent = inventoryFrame })

create("UIGridLayout", {
	CellSize = UDim2.new(0, 48, 0, 48),
	CellPadding = UDim2.new(0, 6, 0, 6),
	FillDirection = Enum.FillDirection.Horizontal,
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
	VerticalAlignment = Enum.VerticalAlignment.Center,
	SortOrder = Enum.SortOrder.LayoutOrder,
	Parent = inventoryFrame,
})

local slotNames = { "Sword", "Shield", "Potion", "Bow", "Helmet", "Boots", "Ring", "Gem", "Scroll" }

for i, name in ipairs(slotNames) do
	local slot = create("TextButton", {
		Name = "Slot_" .. i,
		BackgroundColor3 = Color3.fromRGB(55, 55, 75),
		Text = name,
		TextColor3 = Color3.fromRGB(180, 180, 180),
		TextSize = 10,
		Font = Enum.Font.Gotham,
		LayoutOrder = i,
		Parent = inventoryFrame,
	})

	create("UICorner", { CornerRadius = UDim.new(0, 6), Parent = slot })

	slot.MouseButton1Click:Connect(function()
		print("[TestGameUI] Clicked inventory slot: " .. name)
		slot.BackgroundColor3 = Color3.fromRGB(80, 120, 200)
		task.wait(0.2)
		slot.BackgroundColor3 = Color3.fromRGB(55, 55, 75)
	end)
end

---------------------------------------------------------------------------
-- Action Buttons Row
---------------------------------------------------------------------------
local actionRow = create("Frame", {
	Name = "ActionRow",
	Size = UDim2.new(1, -20, 0, 50),
	Position = UDim2.new(0, 10, 1, -60),
	BackgroundTransparency = 1,
	Parent = mainFrame,
})

create("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
	VerticalAlignment = Enum.VerticalAlignment.Center,
	Padding = UDim.new(0, 10),
	Parent = actionRow,
})

local buttonDefs = {
	{ Name = "AttackBtn", Text = "Attack", Color = Color3.fromRGB(200, 60, 60) },
	{ Name = "DefendBtn", Text = "Defend", Color = Color3.fromRGB(60, 120, 200) },
	{ Name = "HealBtn",   Text = "Heal",   Color = Color3.fromRGB(60, 180, 80) },
}

local currentScore = 0
local currentHealth = 100

for _, def in ipairs(buttonDefs) do
	local btn = create("TextButton", {
		Name = def.Name,
		Size = UDim2.new(0, 100, 0, 40),
		BackgroundColor3 = def.Color,
		Text = def.Text,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 16,
		Font = Enum.Font.GothamBold,
		Parent = actionRow,
	})

	create("UICorner", { CornerRadius = UDim.new(0, 8), Parent = btn })

	btn.MouseButton1Click:Connect(function()
		print("[TestGameUI] Action: " .. def.Text)

		if def.Text == "Attack" then
			currentScore = currentScore + 10
			scoreValue.Text = tostring(currentScore)
		elseif def.Text == "Defend" then
			-- Visual flash
			mainFrame.BackgroundColor3 = Color3.fromRGB(40, 40, 70)
			task.wait(0.15)
			mainFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 35)
		elseif def.Text == "Heal" then
			currentHealth = math.min(currentHealth + 20, 100)
			healthBarFill.Size = UDim2.new(currentHealth / 100, 0, 1, 0)
			healthText.Text = tostring(currentHealth) .. " / 100"
			if currentHealth > 50 then
				healthBarFill.BackgroundColor3 = Color3.fromRGB(50, 200, 50)
			end
		end
	end)
end

---------------------------------------------------------------------------
-- Simulate taking damage over time (for testing)
---------------------------------------------------------------------------
task.spawn(function()
	while task.wait(3) do
		if currentHealth > 0 then
			currentHealth = math.max(currentHealth - 5, 0)
			healthBarFill.Size = UDim2.new(currentHealth / 100, 0, 1, 0)
			healthText.Text = tostring(currentHealth) .. " / 100"

			if currentHealth <= 25 then
				healthBarFill.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
			elseif currentHealth <= 50 then
				healthBarFill.BackgroundColor3 = Color3.fromRGB(200, 200, 50)
			end
		end
	end
end)

print("[TestGameUI] MainFrame loaded successfully!")

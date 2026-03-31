-- HUDOverlay: A minimal heads-up display with a minimap placeholder,
-- notification feed, and FPS counter for the test game.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local function create(className, props)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		if k ~= "Parent" then
			inst[k] = v
		end
	end
	if props.Parent then
		inst.Parent = props.Parent
	end
	return inst
end

---------------------------------------------------------------------------
-- ScreenGui
---------------------------------------------------------------------------
local hudGui = create("ScreenGui", {
	Name = "HUDOverlay",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	IgnoreGuiInset = true,
	Parent = playerGui,
})

---------------------------------------------------------------------------
-- Minimap Placeholder (top-right corner)
---------------------------------------------------------------------------
local minimapFrame = create("Frame", {
	Name = "Minimap",
	Size = UDim2.new(0, 150, 0, 150),
	Position = UDim2.new(1, -160, 0, 10),
	BackgroundColor3 = Color3.fromRGB(20, 20, 30),
	BorderSizePixel = 0,
	Parent = hudGui,
})

create("UICorner", { CornerRadius = UDim.new(0, 75), Parent = minimapFrame })
create("UIStroke", { Color = Color3.fromRGB(100, 100, 140), Thickness = 2, Parent = minimapFrame })

create("TextLabel", {
	Name = "MinimapLabel",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1,
	Text = "MINIMAP",
	TextColor3 = Color3.fromRGB(120, 120, 160),
	TextSize = 14,
	Font = Enum.Font.GothamBold,
	Parent = minimapFrame,
})

-- Player dot in minimap
create("Frame", {
	Name = "PlayerDot",
	Size = UDim2.new(0, 8, 0, 8),
	Position = UDim2.new(0.5, -4, 0.5, -4),
	BackgroundColor3 = Color3.fromRGB(50, 200, 255),
	BorderSizePixel = 0,
	Parent = minimapFrame,
})

---------------------------------------------------------------------------
-- Notification Feed (top-left)
---------------------------------------------------------------------------
local notifFrame = create("Frame", {
	Name = "NotificationFeed",
	Size = UDim2.new(0, 300, 0, 200),
	Position = UDim2.new(0, 10, 0, 10),
	BackgroundTransparency = 1,
	ClipsDescendants = true,
	Parent = hudGui,
})

create("UIListLayout", {
	FillDirection = Enum.FillDirection.Vertical,
	VerticalAlignment = Enum.VerticalAlignment.Bottom,
	Padding = UDim.new(0, 4),
	SortOrder = Enum.SortOrder.LayoutOrder,
	Parent = notifFrame,
})

local notifOrder = 0

local function pushNotification(message)
	notifOrder = notifOrder + 1
	local label = create("TextLabel", {
		Name = "Notif_" .. notifOrder,
		Size = UDim2.new(1, 0, 0, 24),
		BackgroundColor3 = Color3.fromRGB(0, 0, 0),
		BackgroundTransparency = 0.5,
		Text = "  " .. message,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 13,
		Font = Enum.Font.Gotham,
		TextXAlignment = Enum.TextXAlignment.Left,
		LayoutOrder = notifOrder,
		Parent = notifFrame,
	})

	create("UICorner", { CornerRadius = UDim.new(0, 4), Parent = label })

	task.delay(5, function()
		if label and label.Parent then
			label:Destroy()
		end
	end)
end

-- Show a welcome notification on load
task.defer(function()
	pushNotification("Welcome to TEST GAME!")
	task.wait(2)
	pushNotification("Use the UI panel to interact.")
	task.wait(2)
	pushNotification("Try the Attack, Defend, and Heal buttons.")
end)

---------------------------------------------------------------------------
-- FPS Counter (bottom-left)
---------------------------------------------------------------------------
local fpsLabel = create("TextLabel", {
	Name = "FPSCounter",
	Size = UDim2.new(0, 80, 0, 24),
	Position = UDim2.new(0, 10, 1, -34),
	BackgroundColor3 = Color3.fromRGB(0, 0, 0),
	BackgroundTransparency = 0.5,
	Text = "FPS: --",
	TextColor3 = Color3.fromRGB(180, 255, 180),
	TextSize = 13,
	Font = Enum.Font.Code,
	Parent = hudGui,
})

create("UICorner", { CornerRadius = UDim.new(0, 4), Parent = fpsLabel })

local frameCount = 0
local elapsed = 0

RunService.RenderStepped:Connect(function(dt)
	frameCount = frameCount + 1
	elapsed = elapsed + dt
	if elapsed >= 1 then
		fpsLabel.Text = string.format("FPS: %d", math.floor(frameCount / elapsed))
		frameCount = 0
		elapsed = 0
	end
end)

---------------------------------------------------------------------------
-- Crosshair (center)
---------------------------------------------------------------------------
local crosshairSize = 20

create("Frame", {
	Name = "CrosshairH",
	Size = UDim2.new(0, crosshairSize, 0, 2),
	Position = UDim2.new(0.5, -crosshairSize / 2, 0.5, -1),
	BackgroundColor3 = Color3.fromRGB(255, 255, 255),
	BackgroundTransparency = 0.3,
	BorderSizePixel = 0,
	Parent = hudGui,
})

create("Frame", {
	Name = "CrosshairV",
	Size = UDim2.new(0, 2, 0, crosshairSize),
	Position = UDim2.new(0.5, -1, 0.5, -crosshairSize / 2),
	BackgroundColor3 = Color3.fromRGB(255, 255, 255),
	BackgroundTransparency = 0.3,
	BorderSizePixel = 0,
	Parent = hudGui,
})

print("[TestGameUI] HUDOverlay loaded successfully!")

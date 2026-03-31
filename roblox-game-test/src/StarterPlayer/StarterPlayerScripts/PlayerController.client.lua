-- PlayerController: Client-side script handling input and character
-- movement enhancements for the test game.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer

---------------------------------------------------------------------------
-- Toggle UI with key press (T)
---------------------------------------------------------------------------
UserInputService.InputBegan:Connect(function(input, gameProcessed)
	if gameProcessed then return end

	if input.KeyCode == Enum.KeyCode.T then
		local gui = player.PlayerGui:FindFirstChild("TestGameUI")
		if gui then
			gui.Enabled = not gui.Enabled
			print("[PlayerController] Toggled UI: " .. tostring(gui.Enabled))
		end
	end
end)

print("[PlayerController] Client controller loaded! Press T to toggle UI.")

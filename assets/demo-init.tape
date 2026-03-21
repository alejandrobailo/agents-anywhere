Output assets/demo-init.gif

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 800
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set CursorBlink false

# Setup: fake HOME + fake gh — hidden from recording
Hide
Type "source assets/demo-setup.sh"
Enter
Sleep 1s
Show

Type "npx agents-anywhere init"
Sleep 300ms
Enter
Sleep 6s

# Select primary agent — Claude Code (quick selection)
Down
Sleep 200ms
Enter

# Let the output breathe — show linking, MCP import, etc.
Sleep 6s

# GitHub repo prompt — YES!
Sleep 300ms
Type "y"
Sleep 100ms
Enter
Sleep 3s

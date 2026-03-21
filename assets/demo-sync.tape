Output assets/demo-sync.gif

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 600
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set CursorBlink false

Type "# Machine A — push your changes"
Sleep 300ms
Enter
Sleep 500ms

Type "agents-anywhere push -m 'Updated CLAUDE.md and added MCP server'"
Sleep 300ms
Enter
Sleep 3s

Type ""
Enter
Sleep 500ms

Type "# Machine B — pull and auto-sync"
Sleep 300ms
Enter
Sleep 500ms

Type "agents-anywhere pull"
Sleep 300ms
Enter
Sleep 3s

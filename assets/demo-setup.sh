#!/bin/bash
# Setup script for VHS demo recording
# Creates fake HOME with agent dirs and a mock gh CLI

export HOME=/tmp/demo-user
mkdir -p ~/.claude ~/.codex ~/.cursor ~/.gemini/antigravity ~/.copilot ~/.kiro ~/.config/opencode ~/.codeium/windsurf ~/bin

# Create fake gh CLI that simulates success
cat > ~/bin/gh << 'EOF'
#!/bin/bash
if [ "$1" = "--version" ]; then
  echo "gh version 2.74.0"
  exit 0
fi
echo "✓ Created repository you/agents-anywhere-config on github.com"
echo "  https://github.com/you/agents-anywhere-config"
echo "✓ Added remote https://github.com/you/agents-anywhere-config.git"
exit 0
EOF
chmod +x ~/bin/gh

export PATH="$HOME/bin:$PATH"
clear

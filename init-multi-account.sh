#!/bin/bash
# Initialize multi-account scheduler configuration

# Create the .booster_accounts.json file in the root directory
cat > .booster_accounts.json << 'EOF'
{
  "accounts": []
}
EOF

# Create initial empty booster files
touch .booster_active
echo "true" > .booster_active

touch .booster_last_run
echo "0" > .booster_last_run

echo "✅ Multi-account scheduler initialized!"
echo "📝 Configuration file created: .booster_accounts.json"
echo ""
echo "📚 Next steps:"
echo "1. Run: npm run dev"
echo "2. Open http://localhost:5173"
echo "3. Connect your first GitHub account"
echo "4. Click 'Multi-Account' button to manage multiple accounts"
echo "5. Add additional GitHub accounts to the scheduler"
echo ""
echo "⏰ Each active account will receive 1 commit every hour automatically!"

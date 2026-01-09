#!/bin/bash
# Скрипт для налаштування проекту nutrition-app

SOURCE="/Users/user/Downloads/deploy-68e56cf4157b26608a500e90"
DEST="/Users/user/Documents/nutrition-app"

echo "📦 Копіюю файли проекту..."

# Копіюємо іконки
cp "$SOURCE/icons/"* "$DEST/public/icons/" 2>/dev/null && echo "✅ Іконки скопійовано"

# Копіюємо логотипи та інші файли
cp "$SOURCE/favicon.ico" "$DEST/public/" 2>/dev/null && echo "✅ favicon.ico"
cp "$SOURCE/logo192.png" "$DEST/public/" 2>/dev/null && echo "✅ logo192.png"
cp "$SOURCE/logo512.png" "$DEST/public/" 2>/dev/null && echo "✅ logo512.png"
cp "$SOURCE/apple-touch-icon.png" "$DEST/public/" 2>/dev/null && echo "✅ apple-touch-icon.png"
cp "$SOURCE/robots.txt" "$DEST/public/" 2>/dev/null && echo "✅ robots.txt"

echo ""
echo "🎉 Готово! Тепер виконай:"
echo "  cd $DEST"
echo "  npm install"
echo "  npm start"

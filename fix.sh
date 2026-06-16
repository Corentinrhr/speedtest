

# 7. Déplacer les environments
mv src/environment.ts src/environments/environment.ts
mv src/environment.prod.ts src/environments/environment.prod.ts

# 8. Nettoyer les dossiers vides
rmdir core/models core/services core 2>/dev/null || true
rmdir features/speedtest features/stability features 2>/dev/null || true
rmdir shared/components/gauge shared/components/layout shared/components/server-selector shared/components shared 2>/dev/null || true

echo ""
echo "=== Structure réorganisée ==="
echo ""
echo "Vérification :"
find src/ -type f \( -name '*.ts' -o -name '*.html' -o -name '*.scss' \) | sort
echo ""
echo "=== DONE - Lancer maintenant : npm install ==="
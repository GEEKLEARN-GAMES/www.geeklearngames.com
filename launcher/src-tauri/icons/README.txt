Icônes du launcher — À GÉNÉRER UNE FOIS (avant le premier build) :

    cd launcher/src-tauri
    cargo tauri icon ../../assets/icons/web-app-manifest-512x512.png

Cette commande produit ici tous les formats requis (icon.ico Windows,
icon.icns macOS, PNG 32/128/256…) à partir du logo 512×512 du site.

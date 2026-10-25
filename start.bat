@echo off
chcp 65001 >nul
setlocal

echo ===================================================
echo           Lancement de Bomberman Arena
echo ===================================================
echo.

cd /d "%~dp0"

:: Verification de Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe ou pas present dans le PATH.
    echo Veuillez installer Node.js 20+ pour lancer le jeu.
    pause
    exit /b 1
)

:: Installation des dependances si node_modules est absent
if not exist "node_modules\" (
    echo [1/4] Installation des dependances [npm ci]...
    call npm ci
    if errorlevel 1 (
        echo [ERREUR] Echec lors de npm ci.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Dependances detectees.
)

:: Compilation TypeScript des workspaces
echo [2/4] Compilation des projets (npm run build --workspaces)...
call npm run build --workspaces
if errorlevel 1 (
    echo [ERREUR] Echec lors de la compilation.
    pause
    exit /b 1
)

:: Lancement du serveur backend dans une fenetre separee
echo [3/4] Demarrage du serveur backend (port 3000)...
start "Bomberman Arena - Serveur" cmd /k "npm run start --workspace=@bomberman-area/server"

:: Delai d'initialisation du serveur
ping -n 3 127.0.0.1 >nul

:: Lancement du client frontend dans une fenetre separee
echo [4/4] Demarrage du client frontend (Vite)...
start "Bomberman Arena - Client" cmd /k "cd /d ""%~dp0client"" && npm run dev"

:: Attente du demarrage du serveur Vite puis ouverture automatique dans le navigateur
ping -n 3 127.0.0.1 >nul
echo.
echo Ouverture du jeu dans le navigateur (http://localhost:5173)...
start http://localhost:5173

echo.
echo ===================================================
echo  Bomberman Arena est lance avec succes !
echo  - Serveur WebSocket : ws://localhost:3000
echo  - Client Web        : http://localhost:5173
echo.
echo  Pour arreter le jeu, fermez simplement les fenetres
echo  "Bomberman Arena - Serveur" et "Bomberman Arena - Client".
echo ===================================================
echo.
pause

@echo off
title Publicar Registro Nacional
rem ==========================================================
rem  Doble clic para publicar la app en Firebase Hosting.
rem  Si la carpeta usa Git, tambien guarda y sube los cambios.
rem ==========================================================

rem Ir a la carpeta donde esta este archivo (la del proyecto)
cd /d "%~dp0"

echo.
echo ==========================================
echo   PUBLICANDO REGISTRO NACIONAL
echo   Carpeta: %CD%
echo ==========================================
echo.

if not exist "firebase.json" (
    echo [ERROR] No encuentro firebase.json en esta carpeta.
    echo Copia publicar.bat dentro de la carpeta del proyecto.
    goto fin
)

rem ---------- 1) Guardar en Git (solo si la carpeta tiene Git) ----------
if exist ".git" (
    where git >nul 2>nul
    if not errorlevel 1 (
        echo [1/2] Guardando cambios en Git...
        git add -A
        git commit -m "Actualizacion %date% %time:~0,5%" >nul 2>nul
        if errorlevel 1 (
            echo       No habia cambios nuevos para guardar.
        ) else (
            echo       Cambios guardados.
        )
        git push >nul 2>nul
        if errorlevel 1 (
            echo       Aviso: no se pudo subir a GitHub. La publicacion sigue igual.
        ) else (
            echo       Subido a GitHub.
        )
        echo.
    )
) else (
    echo [1/2] Esta carpeta no usa Git, se omite este paso.
    echo.
)

rem ---------- 2) Publicar en Firebase ----------
echo [2/2] Publicando en Firebase...
echo.
call firebase deploy --only hosting
if errorlevel 1 (
    echo.
    echo ==========================================
    echo   [ERROR] No se pudo publicar.
    echo   Si dice que firebase no se reconoce o pide
    echo   iniciar sesion, ejecuta en CMD:  firebase login
    echo ==========================================
    goto fin
)

echo.
echo ==========================================
echo   LISTO. App publicada.
echo   En la tablet recarga con Ctrl + F5.
echo ==========================================

:fin
echo.
pause

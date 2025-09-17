@echo off
chcp 65001 > nul
title Configurador do Projeto Node.js

echo ===============================================
echo    CONFIGURADOR DO PROJETO NODE.JS
echo ===============================================
echo.

:: Verificar se o Node.js está instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js não está instalado ou não foi encontrado.
    echo Por favor, instale o Node.js a partir de https://nodejs.org/
    pause
    exit /b 1
)

:: Verificar se o arquivo .env existe
if not exist .env (
    echo Arquivo .env não encontrado.
    echo Criando arquivo de configuração...
    echo.

    set /p "SPOTIFY_CLIENT_ID=Digite o Client ID do Spotify: "
    set /p "SPOTIFY_CLIENT_SECRET=Digite o Client secret do Spotify: "

    (
        echo SPOTIFY_CLIENT_ID=%SPOTIFY_CLIENT_ID%
        echo SPOTIFY_CLIENT_SECRET=%SPOTIFY_CLIENT_SECRET%
        echo PORT=3000
        echo NODE_ENV=development
    ) > .env

    echo.
    echo Arquivo .env criado com sucesso!
    echo.
) else (
    echo Arquivo .env encontrado.
    echo.
)

:: Verificar e instalar dependências se necessário
echo Verificando dependências...
if not exist node_modules (
    echo Instalando dependências...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERRO: Falha ao instalar as dependências.
        pause
        exit /b 1
    )
    echo Dependências instaladas com sucesso!
) else (
    echo Dependências já estão instaladas.
)

:: Verificar se precisa compilar
echo Verificando se precisa compilar...
set NEED_BUILD=1

if exist dist\server.js (
    :: Verificar timestamp da última modificação dos arquivos TypeScript
    set TS_NEWER=0
    for /f "tokens=*" %%F in ('dir /s /b src\*.ts 2^>nul') do (
        if "%%~tF" gtr "%~t0" (
            set TS_NEWER=1
        )
    )

    if !TS_NEWER! equ 0 (
        set NEED_BUILD=0
        echo Build já está atualizada.
    )
)

if %NEED_BUILD% equ 1 (
    echo Compilando TypeScript...
    call npm run build
    if errorlevel 1 (
        echo.
        echo ERRO: Falha ao compilar o TypeScript.
        pause
        exit /b 1
    )
    echo Projeto compilado com sucesso!
)

:: Copiar pasta pública se necessário
if exist ./src/public (
    if not exist dist\public (
        echo Copiando arquivos públicos...
        xcopy /E /I /Y ./src/public dist\public\ >nul
        echo Pasta public copiada para dist/public/
    ) else (
        :: Verificar se há arquivos novos na pasta public
        set PUBLIC_NEWER=0
        for /f "tokens=*" %%F in ('dir /s /b ./src/public\* 2^>nul') do (
            if "%%~tF" gtr "%~t0" (
                set PUBLIC_NEWER=1
            )
        )

        if !PUBLIC_NEWER! equ 1 (
            echo Atualizando arquivos públicos...
            xcopy /E /I /Y ./src/public dist\public\ >nul
            echo Arquivos públicos atualizados.
        ) else (
            echo Arquivos públicos já estão atualizados.
        )
    )
) else (
    echo Aviso: Pasta public não encontrada.
)

echo.
echo ===============================================
echo    PROJETO CONFIGURADO COM SUCESSO!
echo ===============================================
echo.

:: Perguntar se deseja iniciar o servidor
@REM choice /c SN /n /m "Deseja iniciar o servidor agora? (S/N): "
@REM if errorlevel 2 (
@REM     echo.
@REM     echo Para iniciar o servidor posteriormente, execute: npm start
@REM     pause
@REM     exit /b 0
@REM )

echo.
echo Iniciando servidor...
echo O servidor estará disponível em: http://localhost:3000/now-playing/
echo Pressione Ctrl+C para parar o servidor
echo.
call npm start

pause
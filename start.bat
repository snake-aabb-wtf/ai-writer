@echo off
setlocal

cd /d "%~dp0"

if not exist ".env" (
  echo [AI Writer] 未找到 .env
  echo 请先复制 .env.example 为 .env，并填写 OPENAI_BASE_URL、OPENAI_API_KEY、OPENAI_MODEL。
  echo.
  pause
  exit /b 1
)

if not exist "dist\src\server.js" (
  echo [AI Writer] 未找到生产构建，正在执行 npm run build...
  call npm run build
  if errorlevel 1 (
    echo [AI Writer] 构建失败。
    pause
    exit /b 1
  )
)

echo [AI Writer] 正在启动 http://localhost:4317/
node --env-file=.env dist\src\server.js

if errorlevel 1 (
  echo.
  echo [AI Writer] 服务已退出，错误码：%errorlevel%
  pause
)

endlocal

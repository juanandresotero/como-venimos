# Corre el robot en la PC de Juan y sube lo que encuentre a GitHub.
#
# Por que en la PC y no en GitHub: desde 2026-11-14 RE/MAX bloquea a todo lo que no es un
# navegador comun, y los servidores de GitHub no tienen uno que pase. Aca el robot pide los
# datos por Chrome (COMO_VENIMOS_NAVEGADOR=1, ver robot/navegador.py).
#
# Lo dispara una tarea programada de Windows (ver robot/instalar_tarea_en_mi_pc.ps1), pero se
# puede correr a mano:  powershell -File robot\correr_en_mi_pc.ps1

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$carpetaLog = Join-Path $env:LOCALAPPDATA "como-venimos"
New-Item -ItemType Directory -Force $carpetaLog | Out-Null
$log = Join-Path $carpetaLog "robot.log"
Start-Transcript -Path $log -Force | Out-Null

# Primero lo ultimo de GitHub: Juan guarda desde la app y eso genera commits.
git pull --rebase --autostash -q origin main

$env:COMO_VENIMOS_NAVEGADOR = "1"
$env:PYTHONIOENCODING = "utf-8"
python -m robot.main
$salio = $LASTEXITCODE

# Se guarda SIEMPRE, salga bien o mal: si fallo, estado_robot.json lleva el error y la app
# muestra la alerta roja. Es lo mismo que hacia el robot en GitHub.
git add datos/
git commit -q -m ("datos: cartera del {0} (desde la PC)" -f (Get-Date -Format "yyyy-MM-dd"))
git pull --rebase --autostash -q origin main
git push origin main
# Si GitHub no deja subir (se vencio el permiso guardado en la PC), el robot anda pero el
# celular sigue viendo la cartera vieja. Paso del 23 al 26/11/2026 sin que nadie se enterara:
# el `-q` escondia el error. Ahora queda escrito en el log.
if ($LASTEXITCODE -ne 0) {
  Write-Output "NO SE PUDO SUBIR A GITHUB: los datos quedaron solo en la PC. Hay que volver a entrar a GitHub (correr un git push a mano)."
}

Stop-Transcript | Out-Null
exit $salio

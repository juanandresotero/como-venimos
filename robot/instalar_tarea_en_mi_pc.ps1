# Deja programado que el robot corra solo en esta PC, dos veces por dia (06:00 y 18:00).
# Se corre UNA vez:  powershell -File robot\instalar_tarea_en_mi_pc.ps1
#
# - "StartWhenAvailable": si la PC estaba apagada a la hora, corre apenas se prende.
# - Corre con la sesion de Juan abierta: Chrome necesita ventana para que RE/MAX lo deje pasar.
# - Para sacarla:  Unregister-ScheduledTask -TaskName "Como venimos - robot" -Confirm:$false

$nombre = "Como venimos - robot"
$script = Join-Path $PSScriptRoot "correr_en_mi_pc.ps1"

$accion = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$horarios = @(
    New-ScheduledTaskTrigger -Daily -At "06:00"
    New-ScheduledTaskTrigger -Daily -At "18:00"
)
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $horarios `
    -Settings $opciones -Description "Baja la cartera de RE/MAX por Chrome y la sube a GitHub" -Force
Get-ScheduledTask -TaskName $nombre | Select-Object TaskName, State

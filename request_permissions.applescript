tell application "System Events"
    display dialog "El Control de Cursor por Gestos requiere permisos de 'Accesibilidad' para simular pulsaciones de teclas F1-F12.\n\nAl pulsar OK, se abrirán los Ajustes del Sistema. Por favor, activa el interruptor de tu aplicación de Terminal (o iTerm/Antigravity) en la lista." buttons {"OK", "Cancelar"} default button "OK" with title "Permisos Necesarios"
    
    if button returned of result is "OK" then
        tell application "System Settings" to activate
        -- Open Privacy & Security -> Accessibility directly
        open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    end if
end tell

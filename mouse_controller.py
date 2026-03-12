import sys
import os
import json
import pyautogui
import subprocess
import threading
import time
import queue
import platform
import socket
import asyncio
import websockets
from pynput.keyboard import Key, Controller as KeyboardController
from pynput.mouse import Controller as MouseController, Button

# Disable PyAutoGUI failsafe and pause to ensure smooth background operation
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

command_queue = queue.Queue()
keyboard = KeyboardController()
mouse = MouseController()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def prompt_mac_permissions():
    applescript = """
    tell application "System Events"
        try
            display dialog "Cursor Control requires 'Accessibility' permissions to simulate F1-F12 keys.\\n\\nPlease enable your Terminal app in the Settings list." buttons {"OK"} default button "OK" with title "Permissions Required"
            tell application "System Settings" to activate
            open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        end try
    end tell
    """
    try:
        subprocess.run(['osascript', '-e', applescript], check=False)
    except:
        pass

def execute_mac_applescript(script):
    if platform.system() != 'Darwin':
        return
    try:
        subprocess.run(['osascript', '-e', script], check=False, timeout=1.0)
    except subprocess.TimeoutExpired:
        print("AppleScript blocked by macOS permissions. Prompting user to fix...", file=sys.stderr)
        prompt_mac_permissions()
    except Exception as e:
        print(f"AppleScript Error: {e}", file=sys.stderr)

def press_hotkey(keys):
    try:
        print(f"Executing hotkey: {' + '.join(keys).upper()}")
        mapped_keys = []
        for k in keys:
            k_lower = k.lower()
            if k_lower in ['cmd', 'command', 'windows', 'super']:
                mapped_keys.append('command' if platform.system() == 'Darwin' else 'win')
            elif k_lower == 'ctrl':
                mapped_keys.append('ctrl')
            else:
                mapped_keys.append(k_lower)
        pyautogui.hotkey(*mapped_keys)
    except Exception as e:
        print(f"Hotkey Error: {e}", file=sys.stderr)

async def ws_handler(websocket):
    print(f"✅ ¡Conexión establecida desde {websocket.remote_address}!")
    try:
        async for message in websocket:
            try:
                command = json.loads(message)
                if command.get("type") != "move":
                    print(f"📩 Comando recibido: {command.get('type')}")
                command_queue.put(command)
            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        print(f"❌ Conexión cerrada para {websocket.remote_address}")

def worker_thread():
    """Processes commands from the queue in a separate thread to avoid blocking the async loop"""
    print("🧵 Hilo de ejecución de comandos (Worker) iniciado.")
    last_move_time = 0
    while True:
        try:
            # Process all pending commands
            latest_move = None
            actions_to_run = []
            
            # Use small wait to not peg CPU
            if command_queue.empty():
                time.sleep(0.005)
                continue

            while not command_queue.empty():
                try:
                    cmd = command_queue.get_nowait()
                    if cmd.get("type") == "move":
                        latest_move = cmd
                    else:
                        actions_to_run.append(cmd)
                except queue.Empty:
                    break
            
            for command in actions_to_run:
                try:
                    action = command.get("type")
                    if action == "click":
                        btn_str = command.get("button", "left")
                        btn = Button.right if btn_str == "right" else Button.left
                        print(f"🖱️  Click {btn_str}")
                        mouse.click(btn)
                    elif action == "mouse_down":
                        btn_str = command.get("button", "left")
                        btn = Button.right if btn_str == "right" else Button.left
                        print(f"🖱️  Manteniendo {btn_str}")
                        mouse.press(btn)
                    elif action == "mouse_up":
                        btn_str = command.get("button", "left")
                        btn = Button.right if btn_str == "right" else Button.left
                        mouse.release(btn)
                    elif action == "scroll":
                        delta = command.get("delta", 0)
                        if delta != 0:
                            # Use pynput for smoother vertical scroll
                            mouse.scroll(0, int(delta))
                    elif action == "volume":
                        direction = command.get("direction", "up")
                        print(f"🔊 Volumen {direction}")
                        if platform.system() == 'Darwin':
                            if direction == "up":
                                execute_mac_applescript('set volume output volume (output volume of (get volume settings) + 5)')
                            elif direction == "down":
                                execute_mac_applescript('set volume output volume (output volume of (get volume settings) - 5)')
                        else:
                            pyautogui.press('volumeup' if direction == "up" else 'volumedown')
                    elif action == "brightness":
                        direction = command.get("direction", "up")
                        print(f"🔆 Brillo {direction}")
                        if platform.system() == 'Darwin':
                            execute_mac_applescript(f'tell application "System Events" to key code {"144" if direction == "up" else "145"}')
                    elif action == "key":
                        key = command.get("key")
                        if key:
                            key_lower = key.lower()
                            print(f"⌨️  Tecla: {key.upper()}")
                            if platform.system() == 'Darwin':
                                if key_lower == "f1": execute_mac_applescript('tell application "System Events" to key code 145')
                                elif key_lower == "f2": execute_mac_applescript('tell application "System Events" to key code 144')
                                elif key_lower == "f3": execute_mac_applescript('tell application "System Events" to key code 160')
                                elif key_lower == "f4": execute_mac_applescript('tell application "System Events" to key code 131')
                                elif key_lower == "f10": pyautogui.press('volumemute')
                                elif key_lower == "f11": pyautogui.press('volumedown')
                                elif key_lower == "f12": pyautogui.press('volumeup')
                                else: pyautogui.press(key_lower)
                            else:
                                if key_lower == "f10": pyautogui.press('volumemute')
                                elif key_lower == "f11": pyautogui.press('volumedown')
                                elif key_lower == "f12": pyautogui.press('volumeup')
                                else: pyautogui.press(key_lower)
                    elif action == "hotkey":
                        keys = command.get("keys", [])
                        if keys:
                            press_hotkey(keys)
                except Exception as e:
                    print(f"Error executing action: {e}", file=sys.stderr)
            
            if latest_move:
                try:
                    nx, ny = latest_move.get("nx"), latest_move.get("ny")
                    if nx is not None and ny is not None:
                        screen_w, screen_h = pyautogui.size()
                        # Use pynput for much smoother and faster movement on macOS
                        mouse.position = (nx * screen_w, ny * screen_h)
                        # Periodic movement log to avoid spamming
                        now = time.time()
                        if now - last_move_time > 2:
                            print(f"📍 Moviendo cursor: Posición {nx:.2f}, {ny:.2f}")
                            last_move_time = now
                except Exception as e:
                    print(f"Move error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Worker thread error: {e}", file=sys.stderr)
        
        time.sleep(0.005)

async def main_async():
    local_ip = get_local_ip()
    ws_url = f"ws://{local_ip}:3001"
    web_app_url = f"https://hand-tracking-orpin.vercel.app/?ws={ws_url}"
    os_name = platform.system()
    current_file = os.path.abspath(__file__)
    current_dir = os.path.dirname(current_file)
    
    print("="*60)
    print("   HAND TRACKING CURSOR - REMOTE SERVER")
    print("="*60)
    print(f"   💻 Sistema: {os_name}")
    print(f"   📂 Ruta: {current_file}")
    print(f"   1. Local IP: {local_ip}")
    print(f"   2. WebSocket Server: Listening on port 3001")
    
    if platform.system() == 'Darwin':
        print("\n   🍎 NOTA PARA MAC: Asegúrate de dar permisos de 'Accesibilidad' a tu Terminal")
        print("      en Ajustes > Privacidad y Seguridad > Accesibilidad.")
    print("\n   🚀 COMANDO PARA INICIAR:")
    print(f"   cd \"{current_dir}\" && python3 mouse_controller.py")
    print("\n   📱 ACCESO AUTOMÁTICO:")
    print(f"   {web_app_url}")
    print("="*60)
    print("Running... (Press Ctrl+C to stop)")
    
    # Start worker thread
    t = threading.Thread(target=worker_thread, daemon=True)
    t.start()
    
    # Start WebSocket server
    async with websockets.serve(ws_handler, "0.0.0.0", 3001):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main_async())
    except OSError as e:
        if e.errno == 48:
            print(f"\n❌ ERROR: El puerto 3001 ya está en uso.")
            print(f"   Es probable que una instancia previa de 'mouse_controller.py' siga abierta.")
            print(f"   Para cerrarla, corre este comando en tu terminal:")
            print(f"   lsof -ti:3001 | xargs kill -9")
            print(f"\n   Después intenta iniciar el script de nuevo.")
        else:
            print(f"❌ Error al iniciar el servidor: {e}")
    except KeyboardInterrupt:
        print("\n👋 Deteniendo servidor...")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        sys.exit(1)

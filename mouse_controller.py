import sys
import json
import pyautogui
import subprocess
import threading
import time
import queue
import platform
import socket
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
        # Create a dummy socket to detect preferred outbound IP
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
        # Timeout is low (1s) so we instantly know if a permission prompt is blocking the background execution
        subprocess.run(['osascript', '-e', script], check=False, timeout=1.0)
    except subprocess.TimeoutExpired:
        print("AppleScript blocked by macOS permissions. Prompting user to fix...", file=sys.stderr)
        prompt_mac_permissions()
    except Exception as e:
        print(f"AppleScript Error: {e}", file=sys.stderr)

def press_hotkey(keys):
    """Universal hotkey support for combinations like ['ctrl', 'alt', 'del'] or ['cmd', 'space']"""
    try:
        print(f"Executing hotkey combination: {' + '.join(keys).upper()}")
        # Map some common keys to platform-specific equivalents if needed
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

def input_thread():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            command = json.loads(line)
            command_queue.put(command)
        except json.JSONDecodeError:
            pass
        except Exception as e:
            print(f"Input thread error: {e}", file=sys.stderr)

def main():
    local_ip = get_local_ip()
    ws_url = f"ws://{local_ip}:3001"
    web_app_url = f"https://hand-tracking-orpin.vercel.app/?ws={ws_url}"
    os_name = platform.system()
    
    # Get current working directory and file path
    current_file = os.path.abspath(__file__)
    current_dir = os.path.dirname(current_file)
    
    print("="*60)
    print("   HAND TRACKING CURSOR - SERVER STARTED")
    print("="*60)
    print(f"   💻 Sistema: {os_name}")
    print(f"   📂 Ruta: {current_file}")
    print(f"   1. Local IP: {local_ip}")
    print(f"   2. WebSocket: {ws_url}")
    print("\n   🚀 COMANDO PARA INICIAR (Copia esto):")
    print(f"   cd \"{current_dir}\" && python3 mouse_controller.py")
    print("\n   📱 ACCESO AUTOMÁTICO (Abre en tu móvil):")
    print(f"   {web_app_url}")
    print("="*60)
    print("Running... (Press Ctrl+C to stop)")
    
    t = threading.Thread(target=input_thread, daemon=True)
    t.start()
    
    try:
        while True:
            # Process all pending commands
            latest_move = None
            actions_to_run = []
            
            while not command_queue.empty():
                try:
                    cmd = command_queue.get_nowait()
                    if cmd.get("type") == "move":
                        latest_move = cmd
                    else:
                        actions_to_run.append(cmd)
                except queue.Empty:
                    break
            
            # Execute all non-move actions in order
            for command in actions_to_run:
                try:
                    action = command.get("type")
                    if action == "click":
                        # using pynput for clicks now
                        btn_str = command.get("button", "left")
                        btn = Button.right if btn_str == "right" else Button.left
                        mouse.click(btn)
                    elif action == "mouse_down":
                        btn_str = command.get("button", "left")
                        btn = Button.right if btn_str == "right" else Button.left
                        mouse.press(btn)
                    elif action == "mouse_up":
                        btn_str = command.get("button", "left")
                        btn = Button.right if btn_str == "right" else Button.left
                        mouse.release(btn)
                    elif action == "scroll":
                        delta = command.get("delta", 0)
                        if delta != 0:
                            pyautogui.scroll(int(delta))
                    elif action == "volume":
                        direction = command.get("direction", "up")
                        if platform.system() == 'Darwin':
                            if direction == "up":
                                execute_mac_applescript('set volume output volume (output volume of (get volume settings) + 5)')
                            elif direction == "down":
                                execute_mac_applescript('set volume output volume (output volume of (get volume settings) - 5)')
                        else:
                            pyautogui.press('volumeup' if direction == "up" else 'volumedown')
                    elif action == "brightness":
                        direction = command.get("direction", "up")
                        if platform.system() == 'Darwin':
                            execute_mac_applescript(f'tell application "System Events" to key code {"144" if direction == "up" else "145"}')
                    elif action == "key":
                        key = command.get("key")
                        if key:
                            key_lower = key.lower()
                            print(f"Executing Key/F-Key: {key.upper()}")
                            if platform.system() == 'Darwin':
                                # Hardware-feel mapping for Mac
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
                    print(f"Error handling action: {e}", file=sys.stderr)
            
            # Execute only the latest move
            if latest_move:
                try:
                    # Get normalized coordinates (0.0 to 1.0)
                    nx = latest_move.get("nx")
                    ny = latest_move.get("ny")
                    
                    if nx is not None and ny is not None:
                        # Scale to screen size dynamically
                        screen_w, screen_h = pyautogui.size()
                        target_x = nx * screen_w
                        target_y = ny * screen_h
                        pyautogui.moveTo(target_x, target_y)
                except Exception as e:
                    print(f"Move error: {e}", file=sys.stderr)
            
            # Sleep ~100fps to avoid pegging CPU while waiting for moves
            time.sleep(0.01)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

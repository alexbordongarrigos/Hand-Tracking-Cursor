import sys
import json
import pyautogui
import subprocess
import threading
import time
import queue
from pynput.keyboard import Key, Controller as KeyboardController
from pynput.mouse import Controller as MouseController, Button

# Disable PyAutoGUI failsafe and pause to ensure smooth background operation
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

command_queue = queue.Queue()
keyboard = KeyboardController()
mouse = MouseController()

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
    try:
        # Timeout is low (1s) so we instantly know if a permission prompt is blocking the background execution
        subprocess.run(['osascript', '-e', script], check=False, timeout=1.0)
    except subprocess.TimeoutExpired:
        print("AppleScript blocked by macOS permissions. Prompting user to fix...", file=sys.stderr)
        prompt_mac_permissions()
    except Exception as e:
        print(f"AppleScript Error: {e}", file=sys.stderr)

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
                        if direction == "up":
                            execute_mac_applescript('set volume output volume (output volume of (get volume settings) + 5)')
                        elif direction == "down":
                            execute_mac_applescript('set volume output volume (output volume of (get volume settings) - 5)')
                        elif direction == "mute":
                            execute_mac_applescript('set volume with output muted')
                    elif action == "brightness":
                        direction = command.get("direction", "up")
                        if direction == "up":
                            execute_mac_applescript('tell application "System Events" to key code 144') 
                        elif direction == "down":
                             execute_mac_applescript('tell application "System Events" to key code 145')
                    elif action == "key":
                        key = command.get("key")
                        if key:
                            key_lower = key.lower()
                            print(f"Executing Mac F-Key hardware map: {key.upper()}")
                            
                            if key_lower == "f1":
                                execute_mac_applescript('tell application "System Events" to key code 145') # Brightness down
                            elif key_lower == "f2":
                                execute_mac_applescript('tell application "System SignIn" to key code 144') # Brightness up - generic
                                execute_mac_applescript('tell application "System Events" to key code 144')
                            elif key_lower == "f3":
                                # Mission Control
                                execute_mac_applescript('tell application "System Events" to key code 160')
                            elif key_lower == "f4":
                                # Launchpad
                                execute_mac_applescript('tell application "System Events" to key code 131')
                            elif key_lower == "f7":
                                keyboard.press(Key.media_previous)
                                keyboard.release(Key.media_previous)
                            elif key_lower == "f8":
                                keyboard.press(Key.media_play_pause)
                                keyboard.release(Key.media_play_pause)
                            elif key_lower == "f9":
                                keyboard.press(Key.media_next)
                                keyboard.release(Key.media_next)
                            elif key_lower == "f10":
                                keyboard.press(Key.media_volume_mute)
                                keyboard.release(Key.media_volume_mute)
                            elif key_lower == "f11":
                                keyboard.press(Key.media_volume_down)
                                keyboard.release(Key.media_volume_down)
                            elif key_lower == "f12":
                                keyboard.press(Key.media_volume_up)
                                keyboard.release(Key.media_volume_up)
                            elif key_lower in ["f5", "f6"]:
                                # Generic fallback
                                keyboard.press(key)
                                keyboard.release(key)
                            else:
                                keyboard.press(key)
                                keyboard.release(key)
                    elif action == "hotkey":
                        keys = command.get("keys", [])
                        if keys:
                            pyautogui.hotkey(*keys)
                except Exception as e:
                    print(f"Error handling action: {e}", file=sys.stderr)
            
            # Execute only the latest move
            if latest_move:
                try:
                    x = latest_move.get("x")
                    y = latest_move.get("y")
                    pyautogui.moveTo(x, y)
                except Exception as e:
                    print(f"Move error: {e}", file=sys.stderr)
            
            # Sleep ~100fps to avoid pegging CPU while waiting for moves
            time.sleep(0.01)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

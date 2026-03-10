from pynput.keyboard import Key, Controller
import time
import subprocess

print("Attempting to trigger F11 Show Desktop via raw osascript (Method 1)...")
subprocess.run(['osascript', '-e', 'tell application "System Events" to key code 103'])
time.sleep(2)

print("Attempting to trigger F11 Show Desktop with Fn modifier (Method 2)...")
subprocess.run(['osascript', '-e', 'tell application "System Events" to key code 103 using {function down}'])
time.sleep(2)

print("Attempting direct Mission Control AppleScript call...")
subprocess.run(['osascript', '-e', 'tell application "Mission Control" to launch'])


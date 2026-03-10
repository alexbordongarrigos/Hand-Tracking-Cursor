from pynput.keyboard import Key, Controller
import time

keyboard = Controller()

print("Pressing F11 in 2 seconds...")
time.sleep(2)
try:
    keyboard.press(Key.f11)
    keyboard.release(Key.f11)
    print("F11 pressed successfully using pynput.")
except Exception as e:
    print(f"Error pressing F11: {e}")


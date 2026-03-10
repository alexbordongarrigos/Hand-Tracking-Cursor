from pynput.keyboard import Key, Controller
import time

keyboard = Controller()

print("Testing Media Play/Pause (F8 equivalent)...")
time.sleep(1)
keyboard.press(Key.media_play_pause)
keyboard.release(Key.media_play_pause)

print("Testing Volume Up (F12 equivalent)...")
time.sleep(1)
keyboard.press(Key.media_volume_up)
keyboard.release(Key.media_volume_up)

print("Testing Screen Brightness Down (F1 equivalent)...")
time.sleep(1)
try:
    keyboard.press(Key.media_brightness_down)
    keyboard.release(Key.media_brightness_down)
except AttributeError:
    print("Pynput doesn't natively support brightness keys on this version.")


from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import eventlet
import cv2
import numpy as np
from io import BytesIO
from PIL import Image
import base64
from math import sqrt
import mediapipe as mp

eventlet.monkey_patch()

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# MediaPipe初始化
mp_drawing = mp.solutions.drawing_utils
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

# 全局状态
ratios = []
calibrating = True
min_ratio = float("inf")
max_ratio = float("-inf")
threshold = 0.3
blink_counter = 0
total_blinks = 0
current_eye_state = "open"

def blink_ratio(landmarks, eye_points):
    def dist(p1, p2):
        x1, y1, z1 = p1
        x2, y2, z2 = p2
        return sqrt((x2 - x1)**2 + (y2 - y1)**2 + (z2 - z1)**2)

    hor = dist(landmarks[eye_points[0]], landmarks[eye_points[3]])
    ver1 = dist(landmarks[eye_points[1]], landmarks[eye_points[5]])
    ver2 = dist(landmarks[eye_points[2]], landmarks[eye_points[4]])
    return (ver1 + ver2) / 2.0 / hor if hor != 0 else 0

@socketio.on("frame")
def handle_frame(blob):
    global ratios, calibrating, min_ratio, max_ratio
    global threshold, blink_counter, total_blinks, current_eye_state

    try:
        img = Image.open(BytesIO(blob))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        results = face_mesh.process(rgb_frame)
        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
                l_ratio = blink_ratio(landmarks, LEFT_EYE)
                r_ratio = blink_ratio(landmarks, RIGHT_EYE)
                avg_ratio = (l_ratio + r_ratio) / 2

                if calibrating:
                    min_ratio = min(min_ratio, avg_ratio)
                    max_ratio = max(max_ratio, avg_ratio)
                    ratios.append(avg_ratio)

                    if len(ratios) >= 30:
                        threshold = min_ratio + (max_ratio - min_ratio) * 0.4
                        calibrating = False
                        print(f"[CALIBRATED] min={min_ratio:.3f}, max={max_ratio:.3f}, threshold={threshold:.3f}")
                        socketio.start_background_task(
                            lambda: socketio.emit("calibrated", {"threshold": threshold})
                        )
                else:
                    if avg_ratio < threshold:
                        if current_eye_state != "closed":
                            current_eye_state = "closed"
                            socketio.start_background_task(
                                lambda: socketio.emit("eye_state", {"status": "closed"})
                            )
                        blink_counter += 1
                    else:
                        if blink_counter > 2:
                            total_blinks += 1
                            print(f"[BLINK] Total: {total_blinks}")
                            socketio.start_background_task(
                                lambda: socketio.emit("blink_event", {"total": total_blinks})
                            )
                        blink_counter = 0
                        if current_eye_state != "open":
                            current_eye_state = "open"
                            socketio.start_background_task(
                                lambda: socketio.emit("eye_state", {"status": "open"})
                            )
    except Exception as e:
        print(f"[ERROR] Failed to decode frame: {e}")

@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    global calibrating, ratios, min_ratio, max_ratio
    calibrating = True
    ratios.clear()
    min_ratio = float("inf")
    max_ratio = float("-inf")
    return {"status": "calibrating"}

@app.route("/")
def index():
    return {"status": "backend is live"}

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)

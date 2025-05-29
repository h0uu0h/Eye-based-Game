from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image
from math import sqrt
import eventlet
import eventlet.green.threading as threading

eventlet.monkey_patch()

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# 初始化 MediaPipe
import mediapipe as mp
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1,
                                   min_detection_confidence=0.5, min_tracking_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

class BlinkDetector:
    def __init__(self):
        self.blink_counter = 0
        self.total_blinks = 0
        self.current_eye_state = "open"
        self.calibrating = True
        self.ratios = []
        self.min_ratio = float("inf")
        self.max_ratio = float("-inf")
        self.threshold = 0.3

    def _blink_ratio(self, landmarks, eye_points):
        def euclidean(p1, p2):
            x1, y1, z1 = p1
            x2, y2, z2 = p2
            return sqrt((x2 - x1)**2 + (y2 - y1)**2 + (z2 - z1)**2)

        hor = euclidean(landmarks[eye_points[0]], landmarks[eye_points[3]])
        ver1 = euclidean(landmarks[eye_points[1]], landmarks[eye_points[5]])
        ver2 = euclidean(landmarks[eye_points[2]], landmarks[eye_points[4]])
        ver = (ver1 + ver2) / 2.0
        return ver / hor if hor != 0 else 0

    def process_frame(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)
        if not results.multi_face_landmarks:
            return

        for face_landmarks in results.multi_face_landmarks:
            landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
            left_ratio = self._blink_ratio(landmarks, LEFT_EYE)
            right_ratio = self._blink_ratio(landmarks, RIGHT_EYE)
            avg_ratio = (left_ratio + right_ratio) / 2

            if self.calibrating:
                self.min_ratio = min(self.min_ratio, avg_ratio)
                self.max_ratio = max(self.max_ratio, avg_ratio)
                self.ratios.append(avg_ratio)
                if len(self.ratios) >= 30:
                    self.threshold = self.min_ratio + (self.max_ratio - self.min_ratio) * 0.4
                    self.calibrating = False
                    socketio.start_background_task(lambda: socketio.emit("calibrated", {
                        "threshold": self.threshold
                    }))
                return

            if avg_ratio < self.threshold:
                if self.current_eye_state != "closed":
                    self.current_eye_state = "closed"
                    socketio.start_background_task(lambda: socketio.emit("eye_state", {"status": "closed"}))
                self.blink_counter += 1
            else:
                if self.blink_counter > 2:
                    self.total_blinks += 1
                    socketio.start_background_task(lambda: socketio.emit("blink_event", {
                        "total": self.total_blinks
                    }))
                self.blink_counter = 0
                if self.current_eye_state != "open":
                    self.current_eye_state = "open"
                    socketio.start_background_task(lambda: socketio.emit("eye_state", {"status": "open"}))


detector = BlinkDetector()

@socketio.on("frame")
def handle_frame(data):
    try:
        img = Image.open(BytesIO(data))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        detector.process_frame(frame)
    except Exception as e:
        print("[ERROR] Frame decode failed:", e)

@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    detector.calibrating = True
    detector.ratios.clear()
    detector.min_ratio = float("inf")
    detector.max_ratio = float("-inf")
    return {"status": "calibrating"}

@app.route("/")
def index():
    return {"status": "backend is live"}

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)

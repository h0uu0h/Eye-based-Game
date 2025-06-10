from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import dlib
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
from math import sqrt
import eventlet

eventlet.monkey_patch()

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# 初始化 dlib 检测器
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

# 索引定义
LEFT_EYE_INDICES = list(range(36, 42))
RIGHT_EYE_INDICES = list(range(42, 48))
MOUTH_OUTER_INDICES = list(range(48, 60))
MOUTH_INNER_INDICES = list(range(60, 68))

class BlinkDetector:
    def __init__(self):
        self.blink_counter = 0
        self.total_blinks = 0
        self.current_eye_state = "open"
        self.calibrating = True
        self.ratios = []
        self.min_ratio = float("inf")
        self.max_ratio = float("-inf")
        self.threshold = 0.25

        self.left_blink_counter = 0
        self.right_blink_counter = 0
        self.left_total_blinks = 0
        self.right_total_blinks = 0
        self.left_eye_state = "open"
        self.right_eye_state = "open"

    def _blink_ratio(self, eye):
        def euclidean(p1, p2):
            return sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
        hor = euclidean(eye[0], eye[3])
        ver1 = euclidean(eye[1], eye[5])
        ver2 = euclidean(eye[2], eye[4])
        ver = (ver1 + ver2) / 2.0
        return ver / hor if hor != 0 else 0

    def process_landmarks(self, landmarks, frame_width, frame_height):
        def normalize(p):
            return (p[0] / frame_width, p[1] / frame_height, 0.0)

        # 提取眼睛和嘴巴关键点（像素坐标）
        left_eye = [landmarks[i] for i in LEFT_EYE_INDICES]
        right_eye = [landmarks[i] for i in RIGHT_EYE_INDICES]
        mouth_outer = [landmarks[i] for i in MOUTH_OUTER_INDICES]
        mouth_inner = [landmarks[i] for i in MOUTH_INNER_INDICES]

        # 转换为归一化坐标发送给前端
        left_eye_norm = [normalize(p) for p in left_eye]
        right_eye_norm = [normalize(p) for p in right_eye]
        mouth_outer_norm = [normalize(p) for p in mouth_outer]
        mouth_inner_norm = [normalize(p) for p in mouth_inner]

        socketio.start_background_task(lambda: socketio.emit("eye_landmarks", {
            "left_eye": left_eye_norm,
            "right_eye": right_eye_norm,
            "mouth_outer": mouth_outer_norm,
            "mouth_inner": mouth_inner_norm
        }))

        # 眨眼检测（像素坐标）
        left_ratio = self._blink_ratio(left_eye)
        right_ratio = self._blink_ratio(right_eye)
        avg_ratio = (left_ratio + right_ratio) / 2.0

        if self.calibrating:
            self.min_ratio = min(self.min_ratio, avg_ratio)
            self.max_ratio = max(self.max_ratio, avg_ratio)
            self.ratios.append(avg_ratio)
            if len(self.ratios) >= 100:
                self.threshold = self.min_ratio + (self.max_ratio - self.min_ratio) * 0.4
                self.calibrating = False
                socketio.start_background_task(lambda: socketio.emit("calibrated", {
                    "threshold": self.threshold
                }))
            return

        # 双眼眨眼状态检测
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

        # 左右眼分别检测
        if left_ratio < self.threshold:
            self.left_blink_counter += 1
            if self.left_eye_state != "closed":
                self.left_eye_state = "closed"
                socketio.start_background_task(lambda: socketio.emit("left_eye_state", {"status": "closed"}))
        else:
            if self.left_blink_counter > 2:
                self.left_total_blinks += 1
                socketio.start_background_task(lambda: socketio.emit("left_blink_event", {
                    "total": self.left_total_blinks
                }))
            self.left_blink_counter = 0
            if self.left_eye_state != "open":
                self.left_eye_state = "open"
                socketio.start_background_task(lambda: socketio.emit("left_eye_state", {"status": "open"}))

        if right_ratio < self.threshold:
            self.right_blink_counter += 1
            if self.right_eye_state != "closed":
                self.right_eye_state = "closed"
                socketio.start_background_task(lambda: socketio.emit("right_eye_state", {"status": "closed"}))
        else:
            if self.right_blink_counter > 2:
                self.right_total_blinks += 1
                socketio.start_background_task(lambda: socketio.emit("right_blink_event", {
                    "total": self.right_total_blinks
                }))
            self.right_blink_counter = 0
            if self.right_eye_state != "open":
                self.right_eye_state = "open"
                socketio.start_background_task(lambda: socketio.emit("right_eye_state", {"status": "open"}))

detector_obj = BlinkDetector()

def shape_to_np(shape):
    # 返回 (x, y) 像素坐标
    return [(shape.part(i).x, shape.part(i).y) for i in range(68)]

@socketio.on("frame")
def handle_frame(data):
    try:
        if hasattr(data, "read"):
            image_data = data.read()
        else:
            image_data = data
        img = Image.open(BytesIO(image_data))
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        h, w = frame.shape[:2]
        faces = detector(gray)
        if not faces:
            return

        for face in faces:
            shape = predictor(gray, face)
            landmarks = shape_to_np(shape)
            detector_obj.process_landmarks(landmarks, w, h)
    except Exception as e:
        print("[ERROR] Frame processing failed:", e)

@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    detector_obj.calibrating = True
    detector_obj.ratios.clear()
    detector_obj.min_ratio = float("inf")
    detector_obj.max_ratio = float("-inf")
    return {"status": "calibrating"}

@app.route("/")
def index():
    return {"status": "backend is live"}

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)

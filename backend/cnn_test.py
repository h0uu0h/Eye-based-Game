import eventlet
eventlet.monkey_patch()

from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image
from keras.models import load_model
import threading
import time

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# 初始化 MediaPipe
import mediapipe as mp
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# 眼睛关键点索引
LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380]
MOUTH_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
MOUTH_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

# 加载CNN模型
IMG_SIZE = (34, 26)  # 模型输入尺寸
model = load_model('models/2018_12_17_22_58_35.h5', compile=False)
print("CNN模型加载完成")

class CameraProcessor:
    def __init__(self):
        self.cap = None
        self.running = False
        self.thread = None
        
        # 眨眼计数器
        self.blink_counter = 0
        self.total_blinks = 0
        self.left_blink_counter = 0
        self.right_blink_counter = 0
        self.left_total_blinks = 0
        self.right_total_blinks = 0
        
        # 眼睛状态
        self.current_eye_state = "open"
        self.prev_eye_state = "open"
        self.left_eye_state = "open"
        self.left_prev_state = "open"
        self.right_eye_state = "open"
        self.right_prev_state = "open"
        
        # 阈值校准
        self.calibrating = True
        self.pred_values = []
        self.min_pred = float("inf")
        self.max_pred = float("-inf")
        self.threshold = 0.1  # 默认阈值

    def start_capture(self):
        if self.running:
            return
            
        self.running = True
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            print("无法打开摄像头")
            return
            
        # 设置摄像头分辨率
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        self.thread = threading.Thread(target=self._capture_loop)
        self.thread.daemon = True
        self.thread.start()

    def stop_capture(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None

    def _capture_loop(self):
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                print("无法读取摄像头帧")
                time.sleep(0.1)
                continue
                
            self.process_frame(frame)
            time.sleep(0.05)  # 控制帧率约20fps

    def crop_eye(self, gray, eye_points, frame_width, frame_height):
        """从灰度图像中裁剪眼睛区域"""
        points = np.array([(int(pt[0] * frame_width), int(pt[1] * frame_height)) for pt in eye_points])
        
        x1, y1 = np.amin(points, axis=0)
        x2, y2 = np.amax(points, axis=0)
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2

        w = (x2 - x1) * 1.2
        h = w * IMG_SIZE[1] / IMG_SIZE[0]

        margin_x, margin_y = w / 2, h / 2

        min_x = int(cx - margin_x)
        min_y = int(cy - margin_y)
        max_x = int(cx + margin_x)
        max_y = int(cy + margin_y)

        eye_rect = np.array([min_x, min_y, max_x, max_y], dtype=np.int32)
        
        # 确保裁剪区域在图像范围内
        min_x = max(0, min_x)
        min_y = max(0, min_y)
        max_x = min(frame_width, max_x)
        max_y = min(frame_height, max_y)
        
        # 处理无效区域
        if max_x <= min_x or max_y <= min_y:
            return np.array([]), eye_rect
        
        eye_img = gray[min_y:max_y, min_x:max_x]
        
        return eye_img, eye_rect

    def predict_eye_state(self, eye_img):
        """使用CNN模型预测眼睛状态"""
        if eye_img.size == 0:
            return 0.0
        
        # 预处理图像
        eye_img = cv2.resize(eye_img, IMG_SIZE)
        eye_input = eye_img.reshape(1, IMG_SIZE[1], IMG_SIZE[0], 1).astype(np.float32) / 255.
        
        # 预测
        prediction = model.predict(eye_input)[0][0]
        return prediction

    def process_frame(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)
        
        h, w, _ = frame.shape
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 重置状态如果没有检测到人脸
        if not results.multi_face_landmarks:
            self.prev_eye_state = "open"
            self.current_eye_state = "open"
            self.left_prev_state = "open"
            self.left_eye_state = "open"
            self.right_prev_state = "open"
            self.right_eye_state = "open"
            
            # 发送默认状态
            socketio.start_background_task(lambda: socketio.emit("eye_landmarks", {
                "left_eye": [],
                "right_eye": [],
                "mouth_outer": [],
                "mouth_inner": []
            }))
            socketio.start_background_task(lambda: socketio.emit("eye_state", {"status": "open"}))
            socketio.start_background_task(lambda: socketio.emit("left_eye_state", {"status": "open"}))
            socketio.start_background_task(lambda: socketio.emit("right_eye_state", {"status": "open"}))
            return

        for face_landmarks in results.multi_face_landmarks:
            # 获取关键点坐标
            landmarks = [(lm.x, lm.y, lm.z) for lm in face_landmarks.landmark]
            
            # 提取关键点
            left_eye_points = [landmarks[i] for i in LEFT_EYE_IDX]
            right_eye_points = [landmarks[i] for i in RIGHT_EYE_IDX]
            mouth_outer = [landmarks[i] for i in MOUTH_OUTER]
            mouth_inner = [landmarks[i] for i in MOUTH_INNER]
            
            # 发送关键点
            socketio.start_background_task(lambda: socketio.emit("eye_landmarks", {
                "left_eye": left_eye_points,
                "right_eye": right_eye_points,
                "mouth_outer": mouth_outer,
                "mouth_inner": mouth_inner
            }))
            
            # 裁剪眼睛区域并使用CNN预测
            left_eye_img, _ = self.crop_eye(gray, left_eye_points, w, h)
            left_pred = self.predict_eye_state(left_eye_img)
            
            right_eye_img, _ = self.crop_eye(gray, right_eye_points, w, h)
            if right_eye_img.size > 0:
                right_eye_img = cv2.flip(right_eye_img, 1)
            right_pred = self.predict_eye_state(right_eye_img)
            
            # 计算双眼平均预测值
            avg_pred = (left_pred + right_pred) / 2.0
            
            # 校准模式
            if self.calibrating:
                self.min_pred = min(self.min_pred, avg_pred)
                self.max_pred = max(self.max_pred, avg_pred)
                self.pred_values.append(avg_pred)
                
                # 计算动态阈值
                if len(self.pred_values) >= 100:
                    self.threshold = self.min_pred + (self.max_pred - self.min_pred) * 0.3
                    self.calibrating = False
                    socketio.start_background_task(lambda: socketio.emit("calibrated", {
                        "threshold": float(self.threshold)
                    }))
                return
            
            # 更新眼睛状态
            self.prev_eye_state = self.current_eye_state
            self.current_eye_state = "closed" if avg_pred < self.threshold else "open"
            
            self.left_prev_state = self.left_eye_state
            left_state = "closed" if left_pred < self.threshold else "open"
            self.left_eye_state = left_state
            
            self.right_prev_state = self.right_eye_state
            right_state = "closed" if right_pred < self.threshold else "open"
            self.right_eye_state = right_state
            
            # 状态变化处理
            if self.current_eye_state != self.prev_eye_state:
                # 发送整体眼睛状态变化
                socketio.start_background_task(lambda: socketio.emit("eye_state", {
                    "status": self.current_eye_state
                }))
                
                # 从闭眼到开眼 - 完成一次眨眼
                if self.prev_eye_state == "closed" and self.current_eye_state == "open":
                    self.total_blinks += 1
                    # 发送眨眼事件
                    socketio.start_background_task(lambda: socketio.emit("blink_event", {
                        "total": self.total_blinks
                    }))
            
            # 左眼状态变化
            if self.left_eye_state != self.left_prev_state:
                socketio.start_background_task(lambda: socketio.emit("left_eye_state", {
                    "status": self.left_eye_state
                }))
                
                # 左眼眨眼完成
                if self.left_prev_state == "closed" and self.left_eye_state == "open":
                    self.left_total_blinks += 1
                    socketio.start_background_task(lambda: socketio.emit("left_blink_event", {
                        "total": self.left_total_blinks
                    }))
            
            # 右眼状态变化
            if self.right_eye_state != self.right_prev_state:
                socketio.start_background_task(lambda: socketio.emit("right_eye_state", {
                    "status": self.right_eye_state
                }))
                
                # 右眼眨眼完成
                if self.right_prev_state == "closed" and self.right_eye_state == "open":
                    self.right_total_blinks += 1
                    socketio.start_background_task(lambda: socketio.emit("right_blink_event", {
                        "total": self.right_total_blinks
                    }))
            
            # 发送EAR值（使用平均预测值）
            socketio.start_background_task(lambda: socketio.emit("ear_value", {
                "value": float(avg_pred)
            }))

camera_processor = CameraProcessor()

@socketio.on("start_capture")
def handle_start_capture():
    print("开始捕获摄像头")
    camera_processor.start_capture()

@socketio.on("stop_capture")
def handle_stop_capture():
    print("停止捕获摄像头")
    camera_processor.stop_capture()
h
@app.route("/start_calibration", methods=["POST"])
def start_calibration():
    camera_processor.calibrating = True
    camera_processor.pred_values = []
    camera_processor.min_pred = float("inf")
    camera_processor.max_pred = float("-inf")
    return {"status": "calibrating"}

@app.route("/")
def index():
    return {"status": "backend is live"}

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False)